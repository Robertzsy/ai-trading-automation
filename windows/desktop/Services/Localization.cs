using System;
using System.Globalization;
using System.IO;
using System.Resources;

namespace AiTradingAutomation.Desktop.Services;

internal static class Localization
{
    private static readonly ResourceManager Resources = new("AiTradingAutomation.Desktop.Resources.Strings", typeof(Localization).Assembly);
    private static string? _cache;
    public static string Language { get; private set; } = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "zh" ? "zh" : "en";
    public static event Action? Changed;
    public static string Text(string key) => Resources.GetString(key, Language == "en" ? CultureInfo.GetCultureInfo("en") : CultureInfo.InvariantCulture) ?? throw new InvalidOperationException("Missing resource: " + key);
    public static void Initialize(string dataRoot, string? requested = null)
    {
        _cache = Path.Combine(dataRoot, "runtime", "ui-language.txt");
        string? cached = null;
        try { if (File.Exists(_cache)) cached = File.ReadAllText(_cache).Trim(); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        if (cached is "zh" or "en") Change(cached);
        else if (requested is "zh" or "en") Change(requested);
        else if (File.Exists(Path.Combine(dataRoot,"settings.yaml")) || File.Exists(Path.Combine(dataRoot,"settings.yaml.imported"))) Change("zh");
    }
    public static void Change(string language)
    {
        if (language is not ("zh" or "en")) return;
        var changed = Language != language;
        Language = language;
        if (_cache != null) { try { Directory.CreateDirectory(Path.GetDirectoryName(_cache)!); File.WriteAllText(_cache,language); } catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { } }
        if (changed) Changed?.Invoke();
    }
}
