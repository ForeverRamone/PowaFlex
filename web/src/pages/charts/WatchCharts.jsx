import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Section } from '../../components.jsx';
import { t } from '../../i18n.js';

/**
 * Las dos gráficas de Visionado, en su propio módulo para que recharts NO entre
 * en el paquete de la página: son 415 KB (119 KB comprimidos) que el navegador
 * tenía que bajar Y ejecutar antes de pintar nada, y en el N100 del servidor eso
 * se nota. Ahora la página sale con sus contadores y sus parrillas, y las
 * gráficas entran cuando llegan.
 *
 * El tema de las gráficas (`ch`) llega por props porque useChartTheme vive en la
 * página: así este módulo no arrastra nada más que recharts.
 */
export default function WatchCharts({ ch, watchedByDecade, watchedByGenre }) {
  return (
    <>
      <Section title={t('Visto vs. pendiente por década')} className="min-w-0">
        <div className="card p-4 h-72 min-w-0">
          <ResponsiveContainer>
            <BarChart data={watchedByDecade} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <XAxis dataKey="decade" stroke={ch.axis} fontSize={12} tickMargin={6} />
              <YAxis stroke={ch.axis} fontSize={12} width={38} />
              <Tooltip contentStyle={ch.tooltip} labelStyle={ch.tooltipLabel} itemStyle={ch.tooltipItem} cursor={{ fill: ch.cursor }} />
              {/* el formatter es necesario: recharts pinta cada rótulo del color de su
                  serie, y el gris claro de «Total» era ilegible sobre el papel */}
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(v) => <span style={{ color: ch.axis }}>{v}</span>}
              />
              <Bar dataKey="watched" name={t('Vistas')} stackId="a" fill={ch.positive} />
              <Bar dataKey="total" name={t('Total')} fill={ch.muted} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
      <Section title={t('Visto vs. total por género')} className="min-w-0">
        <div className="card p-4 h-72 min-w-0">
          <ResponsiveContainer>
            <BarChart data={watchedByGenre} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis type="number" stroke={ch.axis} fontSize={12} />
              <YAxis type="category" dataKey="name" width={104} stroke={ch.axis} fontSize={11} interval={0} tickMargin={4} />
              <Tooltip contentStyle={ch.tooltip} labelStyle={ch.tooltipLabel} itemStyle={ch.tooltipItem} cursor={{ fill: ch.cursor }} />
              {/* el formatter es necesario: recharts pinta cada rótulo del color de su
                  serie, y el gris claro de «Total» era ilegible sobre el papel */}
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(v) => <span style={{ color: ch.axis }}>{v}</span>}
              />
              <Bar dataKey="watched" name={t('Vistas')} fill={ch.positive} />
              <Bar dataKey="total" name={t('Total')} fill={ch.muted} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </>
  );
}
