import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HardDrive, HeartPulse, Subtitles } from 'lucide-react';
import { Spinner, PageHeader } from '../components.jsx';
import { t } from '../i18n.js';

// las dos mitades siguen siendo páginas completas; el Taller solo las agrupa
const Quality = lazy(() => import('./Quality.jsx'));
const Salud = lazy(() => import('./Salud.jsx'));
const Subtitulos = lazy(() => import('./Subtitulos.jsx'));

const TABS = [
  ['calidad', 'Calidad y disco', HardDrive],
  ['datos', 'Salud de los datos', HeartPulse],
  ['subs', 'Subtítulos', Subtitles],
];

/**
 * Calidad y Salud compartían dominio (Radarr, duplicados, ficheros) y hasta
 * bloques duplicados; ahora viven juntas bajo un techo con pestañas. La
 * pestaña va en la URL para que /calidad y /salud puedan redirigir aquí sin
 * romper enlaces viejos.
 */
export default function Taller() {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('tab');
  const tab = TABS.some(([key]) => key === pedida) ? pedida : 'calidad';

  return (
    <div>
      <PageHeader
        eyebrow={t('Tu colección')}
        title={t('Taller')}
        subtitle={t('El mantenimiento de la colección: calidad de los archivos, disco, deuda de Radarr, subtítulos y auditorías de los datos.')}
      />
      <div className="flex gap-2 mb-5 flex-wrap">
        {/* la clave de pestaña NO puede llamarse t: pisaría la función de
            traducción importada y el {t(label)} de abajo reventaría la página */}
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setParams({ tab: key })}
            className={`${tab === key ? 'btn-gold' : 'btn-ghost'} inline-flex items-center gap-2`}
          >
            <Icon size={15} strokeWidth={1.75} /> {t(label)}
          </button>
        ))}
      </div>
      <Suspense fallback={<Spinner />}>
        {tab === 'subs' ? <Subtitulos embedded /> : tab === 'datos' ? <Salud embedded /> : <Quality embedded />}
      </Suspense>
    </div>
  );
}
