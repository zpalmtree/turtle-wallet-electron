var _a = require('electron'), app = _a.app, dialog = _a.dialog, Tray = _a.Tray, Menu = _a.Menu;
var path = require('path');
var fs = require('fs');
var url = require('url');
var https = require('https');
var platform = require('os').platform();
var crypto = require('crypto');
var Store = require('electron-store');
var settings = new Store({ name: 'Settings' });
var log = require('electron-log');
var splash = require('@trodi/electron-splashscreen');
var config = require('./tsdist/js/ws_config');
var IS_DEV = (process.argv[1] === 'dev' || process.argv[2] === 'dev');
var IS_DEBUG = IS_DEV || process.argv[1] === 'debug' || process.argv[2] === 'debug';
var LOG_LEVEL = IS_DEBUG ? 'debug' : 'warn';
var WALLET_CFGFILE = path.join(app.getPath('userData'), 'wconfig.txt');
var WALLETSHELL_VERSION = app.getVersion() || '0.3.x';
var SERVICE_FILENAME = (platform === 'win32' ? config.walletServiceBinaryFilename + ".exe" : config.walletServiceBinaryFilename);
var SERVICE_OSDIR = (platform === 'win32' ? 'win' : (platform === 'darwin' ? 'osx' : 'lin'));
var DEFAULT_SERVICE_BIN = path.join(process.resourcesPath, 'bin', SERVICE_OSDIR, SERVICE_FILENAME);
var DEFAULT_REMOTE_NODE = config.remoteNodeListFallback
    .map(function (a) { return ({ sort: Math.random(), value: a }); })
    .sort(function (a, b) { return a.sort - b.sort; })
    .map(function (a) { return a.value; })[0];
var DEFAULT_SETTINGS = {
    service_bin: DEFAULT_SERVICE_BIN,
    service_host: '127.0.0.1',
    service_port: config.walletServiceRpcPort,
    service_password: 'passwrd',
    service_timeout: 30,
    node_address: DEFAULT_REMOTE_NODE,
    pubnodes_last_updated: 946697799000,
    pubnodes_data: config.remoteNodeListFallback,
    pubnodes_custom: ['127.0.0.1:11898'],
    pubnodes_exclude_offline: false,
    tray_minimize: false,
    tray_close: false,
    darkmode: true,
    service_config_format: config.walletServiceConfigFormat
};
var DEFAULT_SIZE = { width: 840, height: 680 };
var WIN_TITLE = config.appName + " " + WALLETSHELL_VERSION + " - " + config.appDescription;
app.prompExit = true;
app.prompShown = false;
app.needToExit = false;
app.debug = IS_DEBUG;
app.walletConfig = WALLET_CFGFILE;
app.publicNodesUpdated = false;
app.setAppUserModelId(config.appId);
log.transports.console.level = LOG_LEVEL;
log.transports.file.level = LOG_LEVEL;
log.transports.file.maxSize = 5 * 1024 * 1024;
log.info("Starting WalletShell " + WALLETSHELL_VERSION);
if (IS_DEV || IS_DEBUG)
    log.warn("Running in " + (IS_DEV ? 'dev' : 'debug') + " mode");
var trayIcon = path.join(__dirname, './tsdist/assets/tray.png');
var trayIconHide = path.join(__dirname, './tsdist/assets/trayon.png');
var win;
var tray;
function createWindow() {
    // Create the browser window.
    var darkmode = settings.get('darkmode', true);
    var bgColor = darkmode ? '#000000' : '#02853E';
    var winOpts = {
        title: WIN_TITLE,
        icon: path.join(__dirname, './tsdist/assets/walletshell_icon.png'),
        frame: true,
        width: DEFAULT_SIZE.width,
        height: DEFAULT_SIZE.height,
        minWidth: DEFAULT_SIZE.width,
        minHeight: DEFAULT_SIZE.height,
        show: false,
        backgroundColor: bgColor,
        center: true,
        autoHideMenuBar: false,
        menuBarVisibility: false,
        webPreferences: {
            nativeWindowOpen: true,
            nodeIntegrationInWorker: true
        }
    };
    win = splash.initSplashScreen({
        windowOpts: winOpts,
        templateUrl: path.join(__dirname, "./tsdist/html/splash.html"),
        delay: 0,
        minVisible: 800,
        splashScreenOpts: {
            width: 425,
            height: 325,
            transparent: true
        }
    });
    //load the index.html of the app.
    win.loadURL(url.format({
        pathname: path.join(__dirname, './tsdist/html/index.html'),
        protocol: 'file:',
        slashes: true
    }));
    // open devtools
    if (IS_DEV)
        win.webContents.openDevTools();
    // show windosw
    win.once('ready-to-show', function () {
        //win.show();
        win.setTitle(WIN_TITLE);
        if (platform !== 'darwin') {
            tray.setToolTip(config.appSlogan);
        }
    });
    win.on('close', function (e) {
        if ((settings.get('tray_close') && !app.needToExit && platform !== 'darwin')) {
            e.preventDefault();
            win.hide();
        }
        else if (app.prompExit) {
            e.preventDefault();
            if (app.prompShown)
                return;
            var msg = 'Are you sure want to exit?';
            app.prompShown = true;
            dialog.showMessageBox({
                type: 'question',
                buttons: ['Yes', 'No'],
                title: 'Exit Confirmation',
                message: msg
            }, function (response) {
                app.prompShown = false;
                if (response === 0) {
                    app.prompExit = false;
                    win.webContents.send('cleanup', 'Clean it up, Dad!');
                }
                else {
                    app.prompExit = true;
                    app.needToExit = false;
                }
            });
        }
    });
    if (platform !== 'darwin') {
        var contextMenu_1 = Menu.buildFromTemplate([
            { label: 'Minimize to tray', click: function () { win.hide(); } },
            {
                label: 'Quit', click: function () {
                    app.needToExit = true;
                    if (win) {
                        win.close();
                    }
                    else {
                        process.exit(0);
                    }
                }
            }
        ]);
        tray = new Tray(trayIcon);
        tray.setPressedImage(trayIconHide);
        tray.setTitle(config.appName);
        tray.setToolTip(config.appSlogan);
        tray.setContextMenu(contextMenu_1);
        tray.on('click', function () {
            if (!win.isFocused() && win.isVisible()) {
                win.focus();
            }
            else if (settings.get('tray_minimize', false)) {
                if (win.isVisible()) {
                    win.hide();
                }
                else {
                    win.show();
                }
            }
            else {
                if (win.isMinimized()) {
                    win.restore();
                    win.focus();
                }
                else {
                    win.minimize();
                }
            }
        });
        win.on('show', function () {
            tray.setHighlightMode('always');
            tray.setImage(trayIcon);
            contextMenu_1 = Menu.buildFromTemplate([
                { label: 'Minimize to tray', click: function () { win.hide(); } },
                {
                    label: 'Quit', click: function () {
                        app.needToExit = true;
                        win.close();
                    }
                }
            ]);
            tray.setContextMenu(contextMenu_1);
            tray.setToolTip(config.appSlogan);
        });
        win.on('hide', function () {
            tray.setHighlightMode('never');
            tray.setImage(trayIconHide);
            if (platform === 'darwin')
                return;
            contextMenu_1 = Menu.buildFromTemplate([
                { label: 'Restore', click: function () { win.show(); } },
                {
                    label: 'Quit', click: function () {
                        app.needToExit = true;
                        win.close();
                    }
                }
            ]);
            tray.setContextMenu(contextMenu_1);
        });
        win.on('minimize', function (event) {
            if (settings.get('tray_minimize') && platform !== 'darwin') {
                event.preventDefault();
                win.hide();
            }
        });
    }
    win.on('closed', function () {
        win = null;
    });
    win.setMenu(null);
    // misc handler
    win.webContents.on('crashed', function () {
        // todo: prompt to restart
        log.debug('webcontent was crashed');
    });
    win.on('unresponsive', function () {
        // todo: prompt to restart
        log.debug('webcontent is unresponsive');
    });
}
function storeNodeList(pnodes) {
    if (!pnodes)
        return;
    if (!pnodes.length)
        return;
    var validNodes = [];
    pnodes.forEach(function (node) {
        if (node.hasOwnProperty('cache')) {
            if (!config.remoteNodeCacheSupported && true === node.cache) {
                return;
            }
        }
        if (node.hasOwnProperty('ssl')) {
            if (!config.remoteNodeSslSupported && true === node.ssl) {
                return;
            }
        }
        var item = node.url + ":" + node.port;
        validNodes.push(item);
    });
    settings.set('pubnodes_data', validNodes);
}
function doNodeListUpdate() {
    try {
        https.get(config.remoteNodeListUpdateUrl, function (res) {
            var result = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                result += chunk;
            });
            res.on('end', function () {
                try {
                    var pnodes = JSON.parse(result);
                    if (pnodes.hasOwnProperty('nodes')) {
                        pnodes = pnodes.nodes;
                    }
                    storeNodeList(pnodes);
                    if (result.length)
                        settings.set('pubnodes_raw', Buffer.from(result).toString('base64'));
                    settings.set('pubnodes_last_updated', new Date().getTime());
                    settings["delete"]('pubnodes_tested');
                    log.debug('Public node list has been updated');
                }
                catch (e) {
                    log.debug("Failed to update public node list: " + e.message);
                    storeNodeList(false);
                }
            });
        }).on('error', function (e) {
            log.debug("Failed to update public-node list: " + e.message);
            storeNodeList(false);
        });
    }
    catch (e) {
        log.error("Failed to update public-node list: " + e.code + " - " + e.message);
        storeNodeList(false);
    }
}
function updatePublicNodes() {
    if (config.remoteNodeListUpdateUrl) {
        var last_updated = settings.get('pubnodes_last_updated', 946697799000);
        var now = new Date().getTime();
        if (Math.abs(now - last_updated) / 36e5 >= 24) {
            //do update
            log.info('Performing daily public-node list update.');
            doNodeListUpdate();
        }
        else {
            log.info('Public node list up to date, skipping update');
            storeNodeList(false); // from local cache
        }
    }
}
function serviceBinCheck() {
    if (DEFAULT_SERVICE_BIN.startsWith('/tmp')) {
        log.warn("AppImage env, copying service bin file");
        var targetPath_1 = path.join(app.getPath('userData'), SERVICE_FILENAME);
        try {
            fs.renameSync(targetPath_1, targetPath_1 + ".bak", function (err) {
                if (err)
                    log.error(err);
            });
        }
        catch (_e) { }
        try {
            fs.copyFile(DEFAULT_SERVICE_BIN, targetPath_1, function (err) {
                if (err) {
                    log.error(err);
                    return;
                }
                settings.set('service_bin', targetPath_1);
                log.debug("service binary copied to " + targetPath_1);
            });
        }
        catch (_e) { }
    }
    else {
        // don't trust user's settings, recheck
        var svcbin = settings.get('service_bin');
        try {
            if (!fs.existsSync(svcbin)) {
                log.warn("Service binary can't be found, falling back to default");
                settings.set('service_bin', DEFAULT_SERVICE_BIN);
            }
            else {
                log.info('Service binary found');
            }
        }
        catch (_e) {
            log.warn('Failed to check for service binary path, falling back to default');
            settings.set('service_bin', DEFAULT_SERVICE_BIN);
        }
    }
}
function initSettings() {
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
        if (!settings.has(k) || settings.get(k) === null) {
            settings.set(k, DEFAULT_SETTINGS[k]);
        }
    });
    settings.set('service_password', crypto.randomBytes(32).toString('hex'));
    settings.set('version', WALLETSHELL_VERSION);
    serviceBinCheck();
    fs.unlink(WALLET_CFGFILE, function (err) {
        if (err)
            log.debug(err.code === 'ENOENT' ? 'No stalled wallet config' : err.message);
    });
}
app.on('browser-window-created', function (e, window) {
    window.setMenuBarVisibility(false);
    window.setAutoHideMenuBar(false);
});
// Quit when all windows are closed.
app.on('window-all-closed', function () {
    //if (platform !== 'darwin')
    app.quit();
});
app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null)
        createWindow();
});
process.on('uncaughtException', function (e) {
    log.error("Uncaught exception: " + e.message);
    try {
        fs.unlinkSync(WALLET_CFGFILE);
    }
    catch (e) { }
    process.exit(1);
});
process.on('beforeExit', function (code) {
    log.debug("beforeExit code: " + code);
});
process.on('exit', function (code) {
    // just to be sure
    try {
        fs.unlinkSync(WALLET_CFGFILE);
    }
    catch (e) { }
    log.debug("exit with code: " + code);
});
process.on('warning', function (warning) {
    log.warn(warning.code + ", " + warning.name);
});
var silock = app.requestSingleInstanceLock();
app.on('second-instance', function () {
    if (win) {
        if (!win.isVisible())
            win.show();
        if (win.isMinimized())
            win.restore();
        win.focus();
    }
});
if (!silock)
    app.quit();
app.on('ready', function () {
    initSettings();
    updatePublicNodes();
    createWindow();
    // try to target center pos of primary display
    var eScreen = require('electron').screen;
    var primaryDisp = eScreen.getPrimaryDisplay();
    var tx = Math.ceil((primaryDisp.workAreaSize.width - DEFAULT_SIZE.width) / 2);
    var ty = Math.ceil((primaryDisp.workAreaSize.height - (DEFAULT_SIZE.height)) / 2);
    if (tx > 0 && ty > 0) {
        try {
            win.setPosition(parseInt(tx, 10), parseInt(ty, 10));
        }
        catch (_e) { }
    }
    // remove old settings cruft if exist
    setTimeout(function () {
        try {
            settings["delete"]('pubnodes_checked');
        }
        catch (e) { }
        try {
            settings["delete"]('pubnodes_date');
        }
        catch (e) { }
    }, 2500);
});
