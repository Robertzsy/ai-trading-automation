using System;
using System.IO;
using Xunit;
using AiTradingAutomation.Desktop.Services;

namespace AiTradingAutomation.Desktop.Tests;

public class LocalizationTests
{
    [Fact]
    public void SatelliteResourcesSwitchAndPersistWithoutRestart()
    {
        var previous=Localization.Language;
        var directory=Path.Combine(Path.GetTempPath(),"ata-language-"+Guid.NewGuid());
        try
        {
            Localization.Initialize(directory,"en");
            Assert.Equal("Open main window",Localization.Text("Open_main_window"));
            var changes=0;
            Action listener=()=>changes++;
            Localization.Changed+=listener;
            try
            {
                Localization.Change("zh");
                Assert.Equal("打开主窗口",Localization.Text("Open_main_window"));
                Assert.Equal("zh",File.ReadAllText(Path.Combine(directory,"runtime","ui-language.txt")));
                Localization.Change("zh");
                Assert.Equal(1,changes);
                Localization.Change("unsupported");
                Assert.Equal("zh",Localization.Language);
            }
            finally {Localization.Changed-=listener;}
        }
        finally
        {
            Localization.Change(previous);
            if(Directory.Exists(directory))Directory.Delete(directory,true);
        }
    }
}
