# Don Maxi: BCI al panel

Lee **Mis Movimientos** de la cuenta corriente en BCI en línea (cuando tú entras con tu clave) y deja
esos movimientos listos para **Admin → Contabilidad** en repisasdonmaxi.cl. Al abrir Contabilidad
entran solos, con la fecha contable, el monto y el nombre completo de quién te transfiere o a quién
le transfieres.

- Solo lee texto de la página. No toca la clave, no hace clics ni transferencias.
- Lo leído queda guardado en la extensión hasta que el panel lo trae, y después se borra de ella.
- Comprueba que los saldos encadenan (que no falte un movimiento entre medio) y lo avisa abajo a la
  derecha de la página del banco.

## Instalar (una vez)

1. Chrome → `chrome://extensions` (o Edge → `edge://extensions`).
2. Activa **Modo de desarrollador**.
3. **Cargar descomprimida** → elige esta carpeta `extension-bci`.

## Usar

1. Entra a BCI Pyme → Cuentas → **Mis Movimientos**. Si la lista tiene varias páginas, pásalas:
   cada página se va sumando.
2. Abre el panel → **Contabilidad** (o vuelve a esa pestaña). Arriba sale "BCI en línea: N movimientos…".

Prueba local: `node scripts/local-dev/verify-contabilidad-bci.mjs`.
