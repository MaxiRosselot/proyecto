// En el panel: le avisa que la extensión está y le entrega lo leído en BCI cuando lo pide.
//   panel → { dm: 'bci-pedir' }            extensión → { dm: 'bci-movimientos', movimientos, leidoEn }
//   panel → { dm: 'bci-importados' }        (ya quedaron en la planilla: se borran de la extensión)
document.documentElement.dataset.bciPanel = chrome.runtime.getManifest().version
window.addEventListener('message', async ev => {
  if (ev.source !== window || !ev.data || typeof ev.data.dm !== 'string') return
  if (ev.data.dm === 'bci-pedir') {
    const { bci = { movimientos: [] } } = await chrome.storage.local.get('bci')
    window.postMessage({ dm: 'bci-movimientos', movimientos: bci.movimientos, leidoEn: bci.leidoEn || null }, location.origin)
  }
  if (ev.data.dm === 'bci-importados') {
    const { bci } = await chrome.storage.local.get('bci')
    if (bci) await chrome.storage.local.set({ bci: { movimientos: [], leidoEn: bci.leidoEn } })
  }
})
