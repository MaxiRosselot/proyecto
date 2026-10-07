// Sube el PDF de una cotizacion a la carpeta "Cotizaciones Don Maxi" de Drive y lo deja con link
// publico de lectura. La usan upload-pdf (cotizador del admin) y cotizacion-web (clientes).
import { Readable } from 'stream'

export const DRIVE_FOLDER_NAME = 'Cotizaciones Don Maxi'

export async function subirPdfCotizacion(drive, { pdfBuffer, fileName, cotNum }) {
  // 1. Buscar o crear carpeta
  let folderId = null
  const folderSearch = await drive.files.list({
    q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })
  if (folderSearch.data.files?.length) {
    folderId = folderSearch.data.files[0].id
  } else {
    const created = await drive.files.create({
      requestBody: { name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    })
    folderId = created.data.id
  }

  // 2. Al regenerar una cotizacion, el PDF anterior va a la papelera (recuperable 30 dias).
  // Se reconoce por la marca cotNum que se le pone al subirlo; antes se buscaba "Cot<numero>"
  // en el nombre, que los archivos nunca tenian, y los PDF viejos se acumulaban.
  const numero = /^\d+$/.test(String(cotNum || '')) ? String(cotNum) : ''
  if (numero) {
    const existing = await drive.files.list({
      q: `appProperties has { key='cotNum' and value='${numero}' } and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    })
    for (const f of existing.data.files || []) {
      await drive.files.update({ fileId: f.id, requestBody: { trashed: true } }).catch(() => {})
    }
  }

  // 3. Subir PDF
  const uploaded = await drive.files.create({
    requestBody: {
      name: fileName || `Cotizacion-Cot${numero || 'X'}.pdf`,
      mimeType: 'application/pdf',
      parents: [folderId],
      ...(numero ? { appProperties: { cotNum: numero } } : {}),
    },
    media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
    fields: 'id,webViewLink,webContentLink',
  })
  const fileId = uploaded.data.id

  // 4. Hacer público (lectura)
  await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } })

  return {
    fileId,
    viewUrl: uploaded.data.webViewLink,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
  }
}
