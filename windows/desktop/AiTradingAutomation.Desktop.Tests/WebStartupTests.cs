using System.Net;
using System.Threading;
using AiTradingAutomation.Desktop.Services;
using Xunit;

namespace AiTradingAutomation.Desktop.Tests;

public class WebStartupTests
{
    [Theory]
    [InlineData("dsh web: http://localhost:4017/?token=web_abc-123", "http://127.0.0.1:4017/?token=web_abc-123")]
    [InlineData("dsh web: http://127.0.0.1:4017", "http://127.0.0.1:4017/")]
    public void LaunchLine_KeepsAuthenticatedQueryAndSupportsLegacyUrl(string line, string expected)
    {
        Assert.Equal(expected, ProcessManager.ParseWebLaunchUrl(line)?.AbsoluteUri);
    }

    [Theory]
    [InlineData("dsh web: http://example.com:4017/?token=x")]
    [InlineData("dsh web: http://127.0.0.1.evil:4017/?token=x")]
    [InlineData("dsh web: http://user@localhost:4017/?token=x")]
    [InlineData("dsh web: http://localhost:4017/other?token=x")]
    [InlineData("unrelated dsh web: http://localhost:4017/?token=x")]
    public void LaunchLine_RejectsUntrustedOrUnrelatedAddresses(string line)
    {
        Assert.Null(ProcessManager.ParseWebLaunchUrl(line));
    }

    [Fact]
    public async Task HealthCheck_ExchangesWebLaunchTokenAndFollowsSessionCookie()
    {
        using var listener = new HttpListener();
        var origin = "http://127.0.0.1:" + ProcessManager.PickFreePort();
        listener.Prefixes.Add(origin + "/");
        listener.Start();
        var server = Task.Run(async () =>
        {
            var first = await listener.GetContextAsync().WaitAsync(TimeSpan.FromSeconds(5));
            var authenticated = first.Request.Url!.PathAndQuery == "/?token=web-token";
            Assert.Null(first.Request.Headers["X-ATA-Token"]);
            first.Response.StatusCode = authenticated ? 303 : 401;
            if (authenticated)
            {
                first.Response.RedirectLocation = "./";
                first.Response.SetCookie(new Cookie("dsh-session", "accepted", "/"));
            }
            first.Response.Close();
            Assert.True(authenticated, "Launch-token query was dropped or had a slash appended");
            var second = await listener.GetContextAsync().WaitAsync(TimeSpan.FromSeconds(5));
            var hasCookie = second.Request.Cookies["dsh-session"]?.Value == "accepted";
            second.Response.StatusCode = hasCookie ? 200 : 401;
            second.Response.Close();
            Assert.True(hasCookie);
        });
        var ready = new ChatReady { Url = origin + "/?token=web-token", Token = "engine-token" };
        Assert.True(await ProcessManager.IsHealthyAsync(ready, CancellationToken.None));
        await server;
    }
}
