/* eslint-disable no-undef */

var chromeHandle;

function install() {}

async function startup({ resourceURI, rootURI }) {
  await waitForZotero();
  rootURI = rootURI || (resourceURI && resourceURI.spec) || "";

  const classes = typeof Components !== "undefined" ? Components.classes : Cc;
  const interfaces = typeof Components !== "undefined" ? Components.interfaces : Ci;
  const startupService = classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(interfaces.amIAddonManagerStartup);

  chromeHandle = startupService.registerChrome(
    Services.io.newURI(rootURI + "manifest.json"),
    [["content", "margincomments", rootURI + "content/"]],
  );

  const context = { rootURI };
  context._globalThis = context;
  Services.scriptloader.loadSubScript(
    rootURI + "content/scripts/margincomments.js",
    context,
  );
  await Zotero.MarginComments.hooks.onStartup();
}

function onMainWindowLoad({ window }) {
  return Zotero.MarginComments?.hooks.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }) {
  return Zotero.MarginComments?.hooks.onMainWindowUnload(window);
}

function shutdown({ resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;
  Zotero.MarginComments?.hooks.onShutdown();
  rootURI = rootURI || (resourceURI && resourceURI.spec) || "";
  if (rootURI && typeof Cu !== "undefined" && typeof Cu.unload === "function") {
    Cu.unload(rootURI + "content/scripts/margincomments.js");
  }
  chromeHandle?.destruct();
  chromeHandle = undefined;
}

function uninstall() {}

async function waitForZotero() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (typeof Zotero !== "undefined") {
      await Zotero.initializationPromise;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Zotero object was not available during plugin startup");
}
