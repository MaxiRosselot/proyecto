// Le avisa al panel que la extension esta instalada, para que muestre WhatsApp en vez de las instrucciones.
// Solo marca la pagina: no lee nada del panel ni de WhatsApp.
document.documentElement.dataset.whatsappPanel = chrome.runtime.getManifest().version
