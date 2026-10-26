using System.IO;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using AiTradingAutomation.Desktop.Services;
using Xunit;

namespace AiTradingAutomation.Desktop.Tests;

/// <summary>Test requirement #3: process-manager lifecycle plumbing
/// (roots, token, first-run flag, log seeding) without spawning python.</summary>
public class ProcessManagerTests
{
    [Fact]
    public void Ctor_SetsRootsTokenAndSeedsLog()
    {
        using var root = new TempDir();
        var app = root.Dir("app");
        var data = root.Dir("data");
        Directory.CreateDirectory(Path.Combine(app, "python"));
        File.WriteAllText(Path.Combine(app, "python", "pythonw.exe"), "");
        Directory.CreateDirectory(Path.Combine(app, "node"));
        File.WriteAllText(Path.Combine(app, "node", "node.exe"), "");

        using var pm = new ProcessManager(app, data);

        Assert.Equal(app, pm.AppRoot);
        Assert.Equal(data, pm.DataRoot);
        Assert.False(string.IsNullOrEmpty(pm.AccessToken));
        Assert.Equal(pm.AccessToken, Environment.GetEnvironmentVariable("ATA_ACCESS_TOKEN"));
        Assert.True(pm.IsFirstRun);
        Assert.True(File.Exists(Path.Combine(data, "runtime", "logs", "desktop.log")));
        Assert.Equal("http://127.0.0.1:" + pm.WebUrl.Split(':')[2], pm.WebUrl);
        Assert.StartsWith("http://127.0.0.1:", pm.EngineUrl);
    }

    [Fact]
    public void LocateNode_PrefersBundledThenFallsBackToPath()
    {
        using var root = new TempDir();
        var bundled = root.Dir("app");
        Directory.CreateDirectory(Path.Combine(bundled, "node"));
        var bundledNode = Path.Combine(bundled, "node", "node.exe");
        File.WriteAllText(bundledNode, "");
        Assert.Equal(bundledNode, ProcessManager.LocateNode(bundled));

        using var empty = new TempDir();
        var pathDir = Path.Combine(empty.Path, "pathbin");
        Directory.CreateDirectory(pathDir);
        var onPath = Path.Combine(pathDir, "node.exe");
        File.WriteAllText(onPath, "");
        var old = Environment.GetEnvironmentVariable("PATH");
        try
        {
            Environment.SetEnvironmentVariable("PATH", pathDir);
            Assert.Equal(onPath, ProcessManager.LocateNode(empty.Path));
        }
        finally
        {
            Environment.SetEnvironmentVariable("PATH", old);
        }
    }

    [Fact]
    public void PickFreePort_ReturnsLoopbackPort()
    {
        var port = ProcessManager.PickFreePort();
        Assert.InRange(port, 1024, 65535);
    }

    [Fact]
    public void IsFirstRun_FalseOnceSetupCompletes()
    {
        using var root = new TempDir();
        var app = root.Dir("app");
        var data = root.Dir("data");
        Directory.CreateDirectory(Path.Combine(app, "python"));
        File.WriteAllText(Path.Combine(app, "python", "pythonw.exe"), "");
        Directory.CreateDirectory(Path.Combine(app, "node"));
        File.WriteAllText(Path.Combine(app, "node", "node.exe"), "");
        var marker = Path.Combine(data, "runtime", "setup.complete");
        Directory.CreateDirectory(Path.GetDirectoryName(marker)!);
        File.WriteAllText(marker, "1");

        using var pm = new ProcessManager(app, data);

        Assert.False(pm.IsFirstRun);
    }

    [Theory]
    [InlineData(false, 1)]
    [InlineData(true, 0)]
    public void StartAgent_FreshHeartbeatOnlySuppressesStartupForLivePid(bool pidIsLive, int expectedStarts)
    {
        using var root = new TempDir();
        var app = root.Dir("app");
        var data = root.Dir("data");
        Directory.CreateDirectory(Path.Combine(app, "python"));
        File.WriteAllText(Path.Combine(app, "python", "pythonw.exe"), "");
        Directory.CreateDirectory(Path.Combine(app, "node"));
        File.WriteAllText(Path.Combine(app, "node", "node.exe"), "");
        var bus = Path.Combine(data, "runtime", "investment", "bus");
        Directory.CreateDirectory(bus);
        File.WriteAllText(Path.Combine(data, "runtime", "setup.complete"), "1");
        File.WriteAllText(Path.Combine(bus, "worker.json"), Heartbeat(DateTimeOffset.Now.AddSeconds(-2)));
        var starts = 0;
        using var pm = new ProcessManager(app, data, info =>
        {
            Assert.Contains("engine.main run", info.Arguments);
            starts++;
            return null; // Record the launch without starting a scheduler.
        }, _ => pidIsLive ? DateTimeOffset.Now.AddMinutes(-1) : null);

        pm.StartAgent();

        Assert.Equal(expectedStarts, starts);
    }

    [Fact]
    public void WorkerHeartbeat_RequiresLiveProcessThatPredatesItsWrite()
    {
        var now = new DateTimeOffset(2026, 10, 26, 17, 0, 10, TimeSpan.FromHours(8));
        var updated = now.AddSeconds(-2);
        var json = Heartbeat(updated);
        Assert.True(ProcessManager.IsWorkerHeartbeatAlive(json, updated, now, pid =>
        {
            Assert.Equal(25000, pid);
            return now.AddMinutes(-1);
        }));
        Assert.False(ProcessManager.IsWorkerHeartbeatAlive(json, updated, now, _ => null));
        // The PID now exists, but belongs to a process created after the write.
        Assert.False(ProcessManager.IsWorkerHeartbeatAlive(json, updated, now, _ => updated.AddMilliseconds(1)));
        // Even if a stale heartbeat was copied later, its JSON age still bounds
        // the identity check to the original timestamp's one-second precision.
        Assert.False(ProcessManager.IsWorkerHeartbeatAlive(json, now, now, _ => updated.AddSeconds(1)));
        // The worker rounds updated_at down to the second, not its start time.
        Assert.True(ProcessManager.IsWorkerHeartbeatAlive(json, updated.AddMilliseconds(800), now,
            _ => updated.AddMilliseconds(500)));
    }

    [Theory]
    [InlineData(8, true)]
    [InlineData(9, false)]
    [InlineData(-1, false)]
    public void WorkerHeartbeat_RequiresCurrentTimestamp(int ageSeconds, bool expected)
    {
        var now = new DateTimeOffset(2026, 10, 26, 17, 0, 10, TimeSpan.Zero);
        var updated = now.AddSeconds(-ageSeconds);
        Assert.Equal(expected, ProcessManager.IsWorkerHeartbeatAlive(Heartbeat(updated), updated, now,
            _ => now.AddMinutes(-1)));
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("null")]
    [InlineData("[]")]
    [InlineData("invalid json")]
    [InlineData("{\"pid\":25000,\"status\":\"running\"}")]
    [InlineData("{\"pid\":25000,\"updated_at\":\"invalid\",\"status\":\"running\"}")]
    [InlineData("{\"pid\":0}")]
    [InlineData("{\"pid\":-1}")]
    [InlineData("{\"pid\":\"25000\"}")]
    [InlineData("{\"pid\":25000.5}")]
    [InlineData("{\"pid\":2147483648}")]
    public void WorkerHeartbeat_InvalidPayloadDoesNotSuppressStartup(string json)
    {
        var now = DateTimeOffset.Now;
        var probed = false;
        Assert.False(ProcessManager.IsWorkerHeartbeatAlive(json, now, now, _ =>
        {
            probed = true;
            return now.AddMinutes(-1);
        }));
        Assert.False(probed);
    }

    [Fact]
    public void WorkerHeartbeat_ProbeFailureDoesNotSuppressStartup()
    {
        var now = DateTimeOffset.Now;
        Assert.False(ProcessManager.IsWorkerHeartbeatAlive(Heartbeat(now), now, now,
            _ => throw new InvalidOperationException("Process disappeared during inspection.")));
    }

    private static string Heartbeat(DateTimeOffset updatedAt) => JsonSerializer.Serialize(new
    {
        pid = 25000,
        status = "running",
        updated_at = updatedAt.ToString("yyyy-MM-dd'T'HH:mm:sszzz"),
    });

    [Fact]
    public void ConcurrentStarts_BeforeAnyHeartbeat_OwnOnlyOneProcessPerService()
    {
        using var root = new TempDir();
        var app = root.Dir("app");
        var data = root.Dir("data");
        Directory.CreateDirectory(Path.Combine(app, "python"));
        File.WriteAllText(Path.Combine(app, "python", "pythonw.exe"), "");
        Directory.CreateDirectory(Path.Combine(app, "node"));
        File.WriteAllText(Path.Combine(app, "node", "node.exe"), "");
        var bin = Path.Combine(app, "app", "node_modules", "@deepseek-ai", "dsh", "lib");
        Directory.CreateDirectory(bin);
        File.WriteAllText(Path.Combine(bin, "bin.js"), "");
        Directory.CreateDirectory(Path.Combine(data, "runtime"));
        File.WriteAllText(Path.Combine(data, "runtime", "setup.complete"), "1");
        var starts = new ConcurrentDictionary<string, int>();
        var children = new List<Process>();
        using var pm = new ProcessManager(app, data, info =>
        {
            var service = info.Arguments.Contains("engine.main serve") ? "api"
                : info.Arguments.Contains("engine.main run") ? "agent" : "web";
            starts.AddOrUpdate(service, 1, (_, count) => count + 1);
            // Real live children with no worker heartbeat. No Python imports,
            // model, scheduler, or network calls are involved in this fixture.
            info.FileName = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
            info.Arguments = "-NoProfile -NonInteractive -Command \"Start-Sleep -Seconds 30\"";
            var child = Process.Start(info)!;
            children.Add(child);
            return child;
        });
        try
        {
            Parallel.For(0, 24, i => { if (i % 2 == 0) pm.StartPublicServices(); else pm.StartAgent(); });
            Assert.Equal(1, starts["api"]);
            Assert.Equal(1, starts["agent"]);
            Assert.Equal(1, starts["web"]);
            Assert.False(File.Exists(Path.Combine(data, "runtime", "investment", "bus", "worker.json")));
            pm.StopAll();
            pm.StartPublicServices();
            Assert.Equal(2, starts["api"]);
            Assert.Equal(2, starts["agent"]);
            Assert.Equal(2, starts["web"]);
        }
        finally
        {
            pm.StopAll();
            foreach (var child in children)
            {
                try { if (!child.HasExited) child.Kill(entireProcessTree: true); } catch { }
                child.Dispose();
            }
        }
    }

    [Fact]
    public void Ctor_DefaultRoots_FallBackToExeDirectory()
    {
        var oldData = Environment.GetEnvironmentVariable("AI_TRADING_AUTOMATION_DATA_DIR");
        var oldPath = Environment.GetEnvironmentVariable("PATH");
        try
        {
            Environment.SetEnvironmentVariable("AI_TRADING_AUTOMATION_DATA_DIR", null);
            // Can't set BaseDirectory; verify env fallback only.
            Environment.SetEnvironmentVariable("AI_TRADING_AUTOMATION_DATA_DIR", @"C:\nonexistent-ia-data");
            // Hermetic node resolution for the ctor on any machine.
            using var root = new TempDir();
            var pathDir = Path.Combine(root.Path, "pathbin");
            Directory.CreateDirectory(pathDir);
            File.WriteAllText(Path.Combine(pathDir, "pythonw.exe"), "");
            File.WriteAllText(Path.Combine(pathDir, "node.exe"), "");
            Environment.SetEnvironmentVariable("PATH", pathDir);
            using var pm = new ProcessManager();
            Assert.Equal(@"C:\nonexistent-ia-data", pm.DataRoot);
        }
        finally
        {
            Environment.SetEnvironmentVariable("AI_TRADING_AUTOMATION_DATA_DIR", oldData);
            Environment.SetEnvironmentVariable("PATH", oldPath);
        }
    }

    private sealed class TempDir : IDisposable
    {
        public string Path { get; } =
            System.IO.Path.Combine(System.IO.Path.GetTempPath(), "ia-tests-" + Guid.NewGuid().ToString("N"));

        public TempDir() => Directory.CreateDirectory(Path);

        public string Dir(string name)
        {
            var full = System.IO.Path.Combine(Path, name);
            Directory.CreateDirectory(full);
            return full;
        }

        public void Dispose()
        {
            try { Directory.Delete(Path, recursive: true); } catch { }
        }
    }
}
