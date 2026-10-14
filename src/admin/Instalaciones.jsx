import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { C, apiFetch, fmt, styles } from './utils.js'
import { ahoraEnZona } from '../../netlify/functions/lib/horarios.mjs'
import { CONCEPTOS, TIPOS_TRABAJO, resumenMes, sumarMeses } from '../../netlify/functions/lib/resumen-instalaciones.mjs'

// Colores fijos por concepto y por tipo de trabajo: los mismos en barras, leyendas y tabla.
const COLOR = {
  repisas: C.orange, retiro_orden: '#0EA5E9', retiro_basura: '#8B5CF6', cajas: '#10B981', bici: '#EAB308', ajuste: '#9CA3AF',
  solo_repisas: C.orange, con_retiro_orden: '#0EA5E9', con_otros: '#8B5CF6',
}
const NOMBRE_CONCEPTO = Object.fromEntries(CONCEPTOS)
const NOMBRE_TIPO = Object.fromEntries(TIPOS_TRABAJO)
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const tituloMes = mes => { const t = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(mes + '-15T12:00:00Z')); return t.charAt(0).toUpperCase() + t.slice(1) }
const fechaCorta = iso => { const d = new Date(iso + 'T12:00:00Z'); return new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d) }
const pct = (a, b) => (b ? Math.round(a * 100 / b) : 0)

function useEsMovil() {
  const [movil, setMovil] = useState(() => window.innerWidth < 768)
  useEffect(() => { const f = () => setMovil(window.innerWidth < 768); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return movil
}

function Kpi({ titulo, valor, detalle, color = C.text, children }) {
  return (
    <div style={{ ...styles.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ ...styles.cardLabel, marginBottom: 2 }}>{titulo}</span>
      <strong style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valor}</strong>
      {detalle && <span style={{ fontSize: 12, color: C.textSub }}>{detalle}</span>}
      {children}
    </div>
  )
}

function Barra({ partes, alto = 10 }) {
  const total = partes.reduce((s, p) => s + Math.max(0, p.valor), 0)
  return (
    <div style={{ display: 'flex', height: alto, borderRadius: 99, overflow: 'hidden', background: C.border }}>
      {total > 0 && partes.filter(p => p.valor > 0).map(p => <div key={p.clave} title={`${p.nombre}: ${fmt(p.valor)}`} style={{ width: (p.valor * 100 / total) + '%', background: p.color }} />)}
    </div>
  )
}

// Cuanto aporta cada servicio, o cada tipo de trabajo, al mes.
function Desglose({ resumen, agrupar, conIva }) {
  const filas = agrupar === 'servicio'
    ? resumen.conceptos.map(c => ({ clave: c.clave, nombre: c.nombre, valor: conIva ? c.total : c.neto, detalle: c.cantidad ? `${c.cantidad} ${c.cantidad === 1 ? 'instalación' : 'instalaciones'}` : 'sin ventas' }))
    : resumen.tipos.map(t => ({ clave: t.clave, nombre: t.nombre, valor: conIva ? t.total : t.neto, detalle: t.cantidad ? `${t.cantidad} · promedio ${fmt((conIva ? t.total : t.neto) / t.cantidad)}` : 'sin instalaciones' }))
  const total = filas.reduce((s, f) => s + Math.max(0, f.valor), 0)
  const maximo = Math.max(1, ...filas.map(f => f.valor))
  return (
    <div data-testid="desglose">
      <Barra partes={filas.map(f => ({ ...f, color: COLOR[f.clave] }))} alto={14} />
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {filas.map(f => (
          <div key={f.clave} data-concepto={f.clave} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '4px 12px', alignItems: 'baseline', opacity: f.valor ? 1 : .55 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: COLOR[f.clave], flex: 'none' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
            </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text, textAlign: 'right' }}>
              {fmt(f.valor)} <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>{pct(Math.max(0, f.valor), total)}%</span>
            </span>
            <div style={{ height: 6, borderRadius: 99, background: '#F1F2F4', overflow: 'hidden' }}>
              <div style={{ width: Math.max(0, f.valor * 100 / maximo) + '%', height: '100%', background: COLOR[f.clave], borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 11.5, color: C.textMuted, textAlign: 'right' }}>{f.detalle}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Columnas({ datos, marcado, onElegir, conIva }) {
  const maximo = Math.max(1, ...datos.map(d => d.valor))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150, paddingTop: 18 }}>
      {datos.map(d => (
        <button key={d.clave} type="button" onClick={onElegir ? () => onElegir(d.clave) : undefined} title={`${d.nombre}: ${fmt(d.valor)} · ${d.cantidad}`}
          style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: onElegir ? 'pointer' : 'default', fontFamily: 'inherit' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: d.clave === marcado ? C.orangeDark : C.textSub, whiteSpace: 'nowrap' }}>{d.valor ? fmt(d.valor / 1000) + 'k' : ''}</span>
          <div style={{ width: '100%', maxWidth: 46, height: `max(${d.valor * 100 / maximo}%, 3px)`, maxHeight: 'calc(100% - 34px)', borderRadius: '6px 6px 2px 2px',
            background: d.clave === marcado ? `linear-gradient(180deg, ${C.orange}, ${C.orangeDark})` : '#FBD3B4' }} />
          <span style={{ fontSize: 11, fontWeight: d.clave === marcado ? 800 : 600, color: d.clave === marcado ? C.text : C.textMuted }}>{d.nombre}</span>
        </button>
      ))}
    </div>
  )
}

function aCsv(instalaciones) {
  const cab = ['Fecha', 'Cotización', 'Cliente', 'Tipo', ...CONCEPTOS.map(([, n]) => n + ' (neto)'), 'Ajuste (neto)', 'Neto', 'IVA', 'Total', 'Pagado', 'Saldo']
  const filas = instalaciones.map(i => [i.fecha, i.cotNum, i.cliente, NOMBRE_TIPO[i.tipo], ...CONCEPTOS.map(([c]) => i.neto[c] || 0), i.neto.ajuste || 0, i.subtotal, i.iva, i.total, i.pagado, i.saldo])
  return [cab, ...filas].map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
}

function Tabla({ instalaciones, movil, conIva, onVerCotizacion }) {
  const servicios = i => CONCEPTOS.slice(1).filter(([c]) => i.neto[c] > 0).map(([c, n]) => ({ clave: c, nombre: n }))
  const monto = i => (conIva ? i.total : i.subtotal)
  const repisas = i => (conIva ? Math.round(i.neto.repisas * 1.19) : i.neto.repisas)
  const estado = i => (i.realizada
    ? <span style={styles.badge(C.green)}>Realizada</span>
    : <span style={styles.badge(C.blue)}>Agendada</span>)
  const pago = i => (i.saldo === 0
    ? <span style={{ color: C.green, fontWeight: 700 }}>Pagada</span>
    : <span style={{ color: i.realizada ? C.red : C.orangeDark, fontWeight: 700 }}>Saldo {fmt(i.saldo)}</span>)
  const chips = i => servicios(i).map(s => (
    <span key={s.clave} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: COLOR[s.clave] + '1A', color: COLOR[s.clave], whiteSpace: 'nowrap' }}>{s.nombre}</span>
  ))

  if (!instalaciones.length) return <div style={styles.empty}>No hay instalaciones con este filtro.</div>
  if (movil) return (
    <div style={{ display: 'grid', gap: 10 }}>
      {instalaciones.map(i => (
        <button key={i.cotNum} onClick={() => onVerCotizacion?.(i.cotNum)} data-testid="fila-instalacion"
          style={{ textAlign: 'left', border: '1px solid ' + C.border, borderLeft: '4px solid ' + COLOR[i.tipo], borderRadius: 12, background: 'white', padding: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 14, color: C.text }}>{i.cliente}</strong>
            <strong style={{ fontSize: 14, color: C.text }}>{fmt(monto(i))}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: C.textSub }}>
            <span>{fechaCorta(i.fecha)} · N° {i.cotNum}</span>{pago(i)}
          </div>
          {servicios(i).length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{chips(i)}</div>}
        </button>
      ))}
    </div>
  )
  const th = { textAlign: 'left', fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: C.textMuted, padding: '0 10px 10px', whiteSpace: 'nowrap' }
  const td = { padding: '11px 10px', borderTop: '1px solid ' + C.border, fontSize: 13, color: C.text, verticalAlign: 'middle' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={th}>Fecha</th><th style={th}>Cliente</th><th style={th}>Servicios</th>
          <th style={{ ...th, textAlign: 'right' }}>Repisas</th><th style={{ ...th, textAlign: 'right' }}>Total</th>
          <th style={{ ...th, textAlign: 'right' }}>Pago</th><th style={th}>Estado</th>
        </tr></thead>
        <tbody>
          {instalaciones.map(i => (
            <tr key={i.cotNum} data-testid="fila-instalacion" onClick={() => onVerCotizacion?.(i.cotNum)} style={{ cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FAFAFB' }} onMouseLeave={e => { e.currentTarget.style.background = '' }}>
              <td style={{ ...td, whiteSpace: 'nowrap', color: C.textSub }}>{fechaCorta(i.fecha)}<div style={{ fontSize: 11, color: C.textMuted }}>{i.inicio}–{i.fin}</div></td>
              <td style={td}><strong>{i.cliente}</strong><div style={{ fontSize: 11, color: C.textMuted }}>N° {i.cotNum}</div></td>
              <td style={td}><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{servicios(i).length ? chips(i) : <span style={{ color: C.textMuted, fontSize: 12 }}>Solo repisas</span>}</div></td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(repisas(i))}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>{fmt(monto(i))}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontSize: 12 }}>{pago(i)}</td>
              <td style={td}>{estado(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function InstalacionesSection({ onVerCotizacion }) {
  const movil = useEsMovil()
  const hoy = ahoraEnZona().fecha
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [cotizaciones, setCotizaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [conIva, setConIva] = useState(true)
  const [agrupar, setAgrupar] = useState('servicio')
  const [filtro, setFiltro] = useState('todas')

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const r = await apiFetch('/.netlify/functions/get-quotes')
      if (r.error) throw new Error(r.error)
      setCotizaciones(r.quotes || [])
    } catch (e) { setError(e.message || 'No se pudieron leer las cotizaciones') }
    finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const r = useMemo(() => resumenMes(cotizaciones, mes, hoy), [cotizaciones, mes, hoy])
  const t = r.totales
  const v = (total, neto) => (conIva ? total : neto)
  const lista = r.instalaciones.filter(i => filtro === 'todas' || (filtro === 'por_cobrar' ? i.saldo > 0 : i.tipo === filtro))

  function descargar() {
    const blob = new Blob(['﻿' + aCsv(r.instalaciones)], { type: 'text/csv;charset=utf-8' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `instalaciones-${mes}.csv` })
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const segmento = activo => ({ padding: '7px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: activo ? 'white' : 'transparent', color: activo ? C.text : C.textSub, boxShadow: activo ? '0 1px 3px rgba(0,0,0,.12)' : 'none', fontFamily: 'inherit' })
  const chip = activo => ({ padding: '5px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', border: '1.5px solid ' + (activo ? C.orange : C.border), background: activo ? C.orangeLight : 'white', color: activo ? C.orangeDark : C.textSub })
  const variacion = t.variacion === null ? (t.mesAnterior ? '' : 'sin instalaciones el mes anterior')
    : `${t.variacion >= 0 ? '▲' : '▼'} ${Math.abs(t.variacion)}% vs ${MESES_CORTOS[Number(sumarMeses(mes, -1).slice(5)) - 1]}`
  const iva = conIva ? 'con IVA' : 'neto'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setMes(hoy.slice(0, 7))} style={{ ...styles.btnSecondary, padding: '7px 14px' }}>Este mes</button>
          <button onClick={() => setMes(m => sumarMeses(m, -1))} aria-label="Mes anterior" style={{ ...styles.btnSecondary, padding: '7px 12px' }}>‹</button>
          <button onClick={() => setMes(m => sumarMeses(m, 1))} aria-label="Mes siguiente" style={{ ...styles.btnSecondary, padding: '7px 12px' }}>›</button>
          <h2 style={{ ...styles.sectionTitle, fontSize: movil ? 16 : 20, marginLeft: 4 }}>{tituloMes(mes)}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: '#EEF0F3' }} role="tablist" aria-label="Montos">
            <button role="tab" aria-selected={conIva} onClick={() => setConIva(true)} style={segmento(conIva)}>Con IVA</button>
            <button role="tab" aria-selected={!conIva} onClick={() => setConIva(false)} style={segmento(!conIva)}>Neto</button>
          </div>
          <button onClick={cargar} style={{ ...styles.btnSecondary, fontSize: 12, padding: '7px 12px' }}>{cargando ? 'Cargando...' : 'Actualizar'}</button>
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div data-testid="kpis" style={{ display: 'grid', gridTemplateColumns: movil ? '1fr 1fr' : 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 14 }}>
        <Kpi titulo={`Vendido ${iva}`} valor={fmt(v(t.total, t.neto))} color={C.text}
          detalle={variacion && <span style={{ color: t.variacion > 0 ? C.green : t.variacion < 0 ? C.red : C.textSub, fontWeight: 700 }}>{variacion}</span>} />
        <Kpi titulo="Instalaciones" valor={t.cantidad} detalle={`${t.realizadas} realizadas · ${t.cantidad - t.realizadas} por hacer`} />
        <Kpi titulo="Cobrado" valor={fmt(t.cobrado)} color={C.green} detalle={`${pct(t.cobrado, t.total)}% del total con IVA`}>
          <div style={{ marginTop: 6 }}><Barra partes={[{ clave: 'c', nombre: 'Cobrado', valor: t.cobrado, color: C.green }, { clave: 's', nombre: 'Por cobrar', valor: t.porCobrar, color: C.border }]} alto={6} /></div>
        </Kpi>
        <Kpi titulo="Por cobrar" valor={fmt(t.porCobrar)} color={t.porCobrarRealizadas ? C.red : C.orangeDark}
          detalle={t.porCobrarRealizadas ? <span style={{ color: C.red, fontWeight: 700 }}>{fmt(t.porCobrarRealizadas)} de trabajos ya hechos</span> : 'nada atrasado'} />
      </div>

      <div style={{ ...styles.card, padding: '14px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.textSub, marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
          <span><strong style={{ color: C.green }}>{fmt(v(t.realizado, t.realizadoNeto))}</strong> realizado</span>
          <span>Ticket promedio <strong style={{ color: C.text }}>{fmt(v(t.ticketPromedio, t.ticketPromedioNeto))}</strong></span>
          <span><strong style={{ color: C.blue }}>{fmt(v(t.agendado, t.agendadoNeto))}</strong> agendado por hacer</span>
        </div>
        <Barra partes={[{ clave: 'r', nombre: 'Realizado', valor: t.realizado, color: C.green }, { clave: 'a', nombre: 'Agendado', valor: t.agendado, color: '#93C5FD' }]} alto={10} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : 'minmax(0,1.25fr) minmax(0,1fr)', gap: 14, marginBottom: 14 }}>
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{ ...styles.cardLabel, marginBottom: 0 }}>¿De dónde viene la plata?</span>
            <div style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: '#EEF0F3' }} role="tablist" aria-label="Agrupar">
              <button role="tab" aria-selected={agrupar === 'servicio'} onClick={() => setAgrupar('servicio')} style={{ ...segmento(agrupar === 'servicio'), padding: '5px 11px', fontSize: 12 }}>Por servicio</button>
              <button role="tab" aria-selected={agrupar === 'tipo'} onClick={() => setAgrupar('tipo')} style={{ ...segmento(agrupar === 'tipo'), padding: '5px 11px', fontSize: 12 }}>Por tipo de trabajo</button>
            </div>
          </div>
          <Desglose resumen={r} agrupar={agrupar} conIva={conIva} />
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Últimos 6 meses · {iva}</span>
            <Columnas marcado={mes} onElegir={setMes}
              datos={r.tendencia.map(m => ({ clave: m.mes, nombre: MESES_CORTOS[Number(m.mes.slice(5)) - 1], valor: v(m.total, m.neto), cantidad: `${m.cantidad} instalaciones` }))} />
          </div>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Por semana del mes · {iva}</span>
            <Columnas datos={r.semanas.map(s => ({ clave: s.nombre, nombre: s.nombre, valor: v(s.total, s.neto), cantidad: `${s.cantidad} instalaciones` }))} />
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ ...styles.cardLabel, marginBottom: 0 }}>Instalaciones de {tituloMes(mes).toLowerCase()}</span>
          <button onClick={descargar} disabled={!r.instalaciones.length} style={{ ...styles.btnSecondary, fontSize: 12, padding: '6px 12px', opacity: r.instalaciones.length ? 1 : .5 }}>Descargar Excel (CSV)</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {[['todas', 'Todas', r.instalaciones.length], ...TIPOS_TRABAJO.map(([c, n]) => [c, n, r.tipos.find(x => x.clave === c).cantidad]), ['por_cobrar', 'Con saldo', r.instalaciones.filter(i => i.saldo > 0).length]]
            .map(([clave, nombre, n]) => <button key={clave} onClick={() => setFiltro(clave)} aria-pressed={filtro === clave} style={chip(filtro === clave)}>{nombre} · {n}</button>)}
        </div>
        {cargando && !cotizaciones.length ? <div style={styles.empty}>Cargando...</div>
          : <Tabla instalaciones={lista} movil={movil} conIva={conIva} onVerCotizacion={onVerCotizacion} />}
      </div>
    </div>
  )
}
