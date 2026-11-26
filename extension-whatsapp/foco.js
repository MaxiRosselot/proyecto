// Dentro del panel, WhatsApp no le quita el teclado al panel: mientras escribes fuera de WhatsApp (en el
// cotizador, por ejemplo), sus focus() automaticos (al enviar, al llegar un mensaje...) no hacen nada.
// Cuando haces clic en WhatsApp, o el panel te lleva ahi (Enter, 1–9), todo funciona como siempre.
// En su propia pestaña no se toca nada.
if (window.top !== window) {
  const original = HTMLElement.prototype.focus
  HTMLElement.prototype.focus = function (...args) {
    if (!document.hasFocus()) return
    return original.apply(this, args)
  }
}
