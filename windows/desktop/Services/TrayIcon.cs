using System;
using System.Drawing;
using System.Windows.Forms;

namespace AiTradingAutomation.Desktop.Services;

/// <summary>System tray icon with the full management menu.</summary>
internal sealed class TrayIcon : IDisposable
{
    private readonly NotifyIcon _icon;
    private readonly Action _onOpen;
    private readonly Action _onStart;
    private readonly Action _onPause;
    private readonly Action _onViewLogs;
    private readonly Func<bool> _isAutoStartEnabled;
    private readonly Action<bool> _setAutoStart;
    private readonly Action _onExit;

    public TrayIcon(Action onOpen, Action onStart, Action onPause, Action onViewLogs,
        Func<bool> isAutoStartEnabled, Action<bool> setAutoStart, Action onExit)
    {
        _onOpen = onOpen;
        _onStart = onStart;
        _onPause = onPause;
        _onViewLogs = onViewLogs;
        _isAutoStartEnabled = isAutoStartEnabled;
        _setAutoStart = setAutoStart;
        _onExit = onExit;

        var menu = new ContextMenuStrip();
        menu.Items.Add(Localization.Text("Open_main_window"), null, (_, _) => _onOpen());
        menu.Items.Add(Localization.Text("Start_services"), null, (_, _) => _onStart());
        menu.Items.Add(Localization.Text("Pause_investing"), null, (_, _) => _onPause());
        menu.Items.Add(Localization.Text("View_logs"), null, (_, _) => _onViewLogs());
        var autoStartItem = new ToolStripMenuItem(Localization.Text("Start_with_Windows"));
        autoStartItem.Click += (_, _) => _setAutoStart(!_isAutoStartEnabled());
        menu.Items.Add(autoStartItem);
        menu.Opening += (_, _) => autoStartItem.Checked = _isAutoStartEnabled();
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(Localization.Text("Exit"), null, (_, _) => _onExit());

        _icon = new NotifyIcon
        {
            Text = Localization.Text("AI_Trading_Automation_Automated_paper_investing"),
            Icon = SystemIcons.Application,
            ContextMenuStrip = menu,
            Visible = true,
        };
        _icon.DoubleClick += (_, _) => _onOpen();
        Localization.Changed += RefreshLanguage;
    }

    private void RefreshLanguage()
    {
        var keys = new[] {"Open_main_window","Start_services","Pause_investing","View_logs","Start_with_Windows","","Exit"};
        for (var i=0;i<keys.Length;i++) if(keys[i].Length>0) _icon.ContextMenuStrip!.Items[i].Text=Localization.Text(keys[i]);
        _icon.Text = Localization.Text("AI_Trading_Automation_Automated_paper_investing");
    }

    public void ShowMinimizedBalloon()
    {
        _icon.BalloonTipTitle = "AI Trading Automation";
        _icon.BalloonTipText = Localization.Text("Minimized_to_the_system_tray_Background_investing_continues");
        _icon.ShowBalloonTip(2500);
    }

    public void ShowAutoStartBalloon(bool enabled)
    {
        _icon.BalloonTipTitle = "AI Trading Automation";
        _icon.BalloonTipText = enabled ? Localization.Text("Start_with_Windows_enabled") : Localization.Text("Start_with_Windows_disabled");
        _icon.ShowBalloonTip(2500);
    }

    public void ShowErrorBalloon(string message)
    {
        _icon.BalloonTipTitle = "AI Trading Automation";
        _icon.BalloonTipText = message;
        _icon.ShowBalloonTip(4000);
    }

    public void Dispose() { Localization.Changed -= RefreshLanguage; _icon.Dispose(); }
}
