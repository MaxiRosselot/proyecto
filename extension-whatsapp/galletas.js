// Las cookies que WhatsApp Web escribe desde su codigo, cuando esta dentro del panel: se guardan como
// particionadas (SameSite=None; Secure; Partitioned) para que Chrome no las bote. En su propia
// pestaña no se toca nada.
if (window.top !== window) {
  const original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get() { return original.get.call(this) },
    set(valor) {
      let s = String(valor).replace(/;\s*samesite=[^;]*/gi, '').replace(/;\s*partitioned\b/gi, '').replace(/;\s*secure\b/gi, '')
      original.set.call(this, s + '; Secure; SameSite=None; Partitioned')
    },
  })
}
