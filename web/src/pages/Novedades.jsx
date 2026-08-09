import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHeader } from '../components.jsx';
import { t } from '../i18n.js';

/**
 * QUÉ HA CAMBIADO EN CADA VERSIÓN.
 *
 * OJO, no confundir con las «🔔 Novedades» del Dashboard: aquellas son cosas
 * que el pase nocturno detecta en TU colección (una edición de festival
 * publicada, una pedida que llega a digital). Esto es el historial de la
 * APLICACIÓN: qué trae cada versión y por qué.
 *
 * El histórico vive aquí como dato y no se saca del CHANGELOG.md en tiempo de
 * ejecución a propósito: el changelog es para quien lee el repositorio —lleva
 * detalles de implementación, nombres de fichero y números de test— y esto es
 * para quien usa la app. Son dos textos distintos con dos públicos distintos.
 *
 * REGLA DE MANTENIMIENTO: cada vez que se despliega una versión se añade su
 * entrada AQUÍ ARRIBA, además del CHANGELOG, el README y los tres package.json.
 */

const VERSIONES = [
  {
    label: 'Beta 1.09',
    fecha: '2026-08-09',
    titular: 'Buscábamos las películas en el idioma equivocado',
    puntos: [
      'Las fichas de los cánones y los festivales que salían sin cartel no era que TMDB no las tuviera: es que se le preguntaba en español y TMDB no relaciona «The Leopard» con «Il gattopardo». Como esas listas están escritas en inglés, ninguna película con título original en otra lengua podía encontrarse. Ahora se pregunta también en inglés.',
      'Tres fichas más fallaban por cómo se escribe el nombre de quien dirige: «The Wachowskis» frente a «Lana y Lilly Wachowski», «Larissa» frente a «Larisa», «Forough Farokhzad» frente a «Forugh Farrokhzad». Ya se reconocen, sin abrir la mano con los que de verdad son otra persona.',
      'Todo lo que quedó guardado como «sin ficha» se vuelve a intentar solo.',
      'Logotipo nuevo: el símbolo hace de inicial y se lee POWA / FLEX de corrido, en las tres paletas. En el móvil, la versión de una línea.',
    ],
  },
  {
    label: 'Beta 1.08',
    fecha: '2026-08-09',
    titular: 'Quién va a ser un grande dentro de diez años',
    puntos: [
      'Página nueva de directores emergentes: quién está estrenando con éxito de crítica y público hoy y todavía no le sigue nadie. Sale de las tablas de festivales que PowaFlex ya tiene guardadas, no de notas sueltas.',
      'Cinco secciones de debut nuevas —la Semana de la Crítica y la Quincena de Cannes, Orizzonti, Perspectives de la Berlinale y Nuevos Directores de San Sebastián—, que es donde de verdad estrena quien empieza. También están en Festivales y se pueden vigilar con una regla.',
      'Cada ficha explica su puntuación: qué festival, qué nota de la crítica, cuánta gente la ha marcado en Letterboxd y si su segunda película sube respecto a la primera. Un número sin explicación es un oráculo.',
      'Lo que no tiene datos no puntúa cero: sale del reparto. Un debut sin Metacritic no puede quedar por detrás de una película mediana solo porque de la mediana haya más información.',
      'Regla nueva de Radarr: «mándame la ópera prima de todo emergente que llegue a 70».',
      'La cuarentena avisa. Lo que se queda esperando tu visto bueno aparece en las novedades del panel y con un contador en Ajustes, y ya no se decide de una en una: se puede aprobar o vetar todo de golpe.',
      'La bandeja de cuarentena se limpia sola de lo que acabaste teniendo por tu cuenta, y enseña el cartel de cada película para poder decidir.',
    ],
  },
  {
    label: 'Beta 1.07',
    fecha: '2026-08-09',
    titular: 'Reglas automáticas a Radarr, y unos Ajustes que se pueden leer',
    puntos: [
      'Reglas configurables que mandan solas a Radarr lo que pase su filtro: festivales y premios (cada uno por separado, selección oficial o palmarés), estrenos por región, y tus favoritos de cada oficio. Se activan y se afinan una a una.',
      'Cada regla lleva su barrita de nota mínima Σ de 0 a 100. En 0 no filtra: entra todo. Con umbral, lo que aún no tiene nota espera a tenerla en vez de irse a ciegas.',
      'Los estrenos se vigilan durante una quincena antes y después de su fecha: cada noche se vuelve a mirar su nota, y entran el día que cruzan el umbral.',
      'Tope por pasada (20 por defecto) para que un palmarés histórico no te vacíe el disco la primera noche.',
      'El auto-Radarr de siempre se convierte en una regla más, conservando tu configuración exacta.',
      'Cada pasada dice POR QUÉ no entró algo —ya la tienes, bajo el umbral, esperando nota, aplazada por el tope— y el historial de 30 días lleva un 🚫 por película para que ninguna regla la vuelva a mandar.',
      'Ajustes pasa a cinco pestañas —Conexiones, Fuentes y notas, Automatismos, Interfaz y Mantenimiento— en vez de once pantallas de scroll, con la barra de guardar fija abajo. De paso: los ajustes de copia automática ya se pueden guardar (estaban por debajo del único botón de guardar).',
      'Esta misma página, con el histórico de versiones.',
    ],
  },
  {
    label: 'Beta 1.06',
    fecha: '2026-08-07',
    titular: 'Lo que destapó la auditoría de cuatro revisores',
    puntos: [
      'A quien seguías como compositor, montador o director de fotografía no le salía nunca su próxima película en Cine venidero: el calendario solo miraba dirección e interpretación.',
      'El auto-Radarr no filtraba por oficio y podía descargarte lo que un favorito hubiera dirigido alguna vez aunque le siguieras por otra cosa.',
      'El corrector de emparejado de personas se quedó sin botón de deshacer: una corrección equivocada era permanente.',
      'Copias del mismo día ordenadas por la fecha del nombre, no por la del fichero: un rsync o una restauración podían borrar las buenas.',
    ],
  },
  {
    label: 'Beta 1.05',
    fecha: '2026-08-07',
    titular: 'Fuera la auditoría de subtítulos',
    puntos: [
      'Se retira entera la auditoría de subtítulos y audio y la integración con Bazarr, estrenadas el día antes: Bazarr ya se encarga de eso y aquí solo confundía.',
      'Con ella se van la pestaña de Subtítulos del Taller, el criterio de idiomas de Ajustes y más de cien mil filas de dato muerto en la base.',
    ],
  },
  {
    label: 'Beta 1.04',
    fecha: '2026-08-06',
    titular: 'El archivo y los oficios',
    puntos: [
      'Cuatro oficios nuevos que seguir además de dirección e interpretación: guion, fotografía, música y montaje.',
      'Notas y votos de IMDb desde el volcado público, sin gastar API.',
      'Copia de seguridad automática de la base cada noche, con rotación.',
      'El 🚫 para vetar una película al pase automático sin descartarla de todas partes.',
    ],
  },
  {
    label: 'Beta 1.03',
    fecha: '2026-08-06',
    titular: 'Estrenos gana plataformas y VOD de EE UU',
    puntos: [
      'Cuarta pestaña en Estrenos con las plataformas y el VOD de Estados Unidos.',
      'El alquiler y la compra dejan de ser un sí/no: ahora traen los nombres («VOD: Apple TV») y se pueden filtrar.',
    ],
  },
  {
    label: 'Beta 1.02',
    fecha: '2026-08-06',
    titular: 'Arreglo urgente: tres páginas rotas',
    puntos: [
      'Taller, Descubrir huecos y Estrenos morían al abrirlas en los dos idiomas por un fallo de la 1.01. Corregido, con una guarda permanente para que no vuelva a pasar.',
    ],
  },
  {
    label: 'Beta 1.01',
    fecha: '2026-08-06',
    titular: 'PowaFlex habla inglés',
    puntos: [
      'Selector de idioma de la interfaz (español / inglés) en Ajustes, aparte del idioma con el que el servidor pide los datos a TMDB.',
    ],
  },
  {
    label: 'Beta 1.00',
    fecha: '2026-08-06',
    titular: 'La gran reorganización',
    puntos: [
      'Las mismas funciones con la mitad de menú: 13 secciones en tres grupos.',
      'El Taller reúne Calidad y Salud; las sagas pasan a ser una pestaña de Descubrir; Letterboxd se muda a Ajustes.',
      'Estrenos: qué llega y qué acaba de llegar a los cines y a las plataformas de España y EE UU.',
      'Buscador global con ⌘K.',
    ],
  },
  {
    label: 'Alpha 0.9.12 – 0.9.16',
    fecha: '2026-08-05',
    titular: 'Cánones, catálogo de directores y corrección manual',
    puntos: [
      'El top 10 anual de Cahiers du Cinéma y la encuesta de Sight & Sound 2022, en Festivales → Cánones.',
      'Catálogo de 680 directores y directoras en activo, con filtros por región, país, sexo y actividad.',
      'Corrector manual de emparejado con TMDB para personas y películas: para los homónimos que ninguna regla va a acertar.',
      'Filtros demográficos en los «top» de Descubrir huecos.',
    ],
  },
  {
    label: 'Alpha 0.9.5 – 0.9.11',
    fecha: '2026-08-03',
    titular: 'Festivales y premios',
    puntos: [
      'Página nueva: las secciones oficiales de los grandes festivales, edición por edición, desde Wikipedia.',
      'Palmareses históricos y premios (Goya, César, BAFTA, Cine Europeo, Óscar), con vista de nominadas por año.',
      'El emparejado con TMDB se verifica contra la dirección: mejor sin ficha que la ficha de otra película.',
      'Bandeja de novedades en el Dashboard y vigía nocturna de ediciones nuevas.',
    ],
  },
  {
    label: 'Alpha 0.9 – 0.9.4',
    fecha: '2026-08-02',
    titular: 'Letterboxd y el completismo',
    puntos: [
      'Importador del export de Letterboxd: diario, notas, vistas, watchlist y listas.',
      'Descubrir huecos: qué te falta de cada favorito, y los grandes ausentes de tu colección.',
      'Sagas y colecciones incompletas.',
    ],
  },
  {
    label: 'Alpha 0.5 – 0.8.2',
    fecha: '2026-08-01',
    titular: 'Radarr, calendario y aspecto',
    puntos: [
      'Integración con Radarr: pedir lo que falta sin salir de PowaFlex.',
      'Calendario de cine venidero a partir de tus favoritos.',
      '«Actualizar todo» con un botón, y la misma rutina cada noche.',
      'Los tres aspectos elegibles y el rediseño de la interfaz.',
    ],
  },
  {
    label: 'Alpha 0.1 – 0.4',
    fecha: '2026-07-04',
    titular: 'El principio',
    puntos: [
      'Sincronización con Plex: biblioteca, reparto, géneros, visionados y datos técnicos.',
      'Notas de IMDb, Rotten Tomatoes, Metacritic y Letterboxd vía MDBList.',
      'Favoritos, estado vital de las personas y auditoría de calidad de los archivos.',
    ],
  },
];

export default function Novedades() {
  const [version, setVersion] = useState(null);
  useEffect(() => { api('/version').then((v) => !v.error && setVersion(v)); }, []);
  // la primera entrada es la de la versión que se está ejecutando
  const actual = version?.label || VERSIONES[0].label;

  return (
    <div>
      <PageHeader
        eyebrow={t('Cuenta')}
        title={t('Últimas novedades')}
        subtitle={t('Qué trae cada versión de PowaFlex. (Lo que pasa en tu colección —una edición de festival publicada, una pedida que llega a digital— está en las novedades del Dashboard.)')}
      />
      <div className="space-y-4">
        {VERSIONES.map((v) => {
          const esActual = v.label === actual;
          return (
            <section key={v.label} className={esActual ? 'card-raised p-5 border-l-4 !border-l-gold-400' : 'card p-5'}>
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className={`font-semibold ${esActual ? 'text-gold-400' : 'text-zinc-100'}`}>{v.label}</h2>
                {esActual && <span className="badge-quiet">{t('la que tienes')}</span>}
                <span className="text-xs text-zinc-500 ml-auto shrink-0">{v.fecha}</span>
              </div>
              <p className="text-sm text-zinc-300 mt-1">{t(v.titular)}</p>
              <ul className="mt-3 space-y-1.5">
                {v.puntos.map((p, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex gap-2">
                    <span className="text-gold-400 shrink-0">·</span>
                    <span>{t(p)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-600 mt-6">
        {t('El detalle técnico de cada versión, con nombres de fichero y motivos de cada arreglo, está en el CHANGELOG del repositorio.')}
      </p>
    </div>
  );
}
