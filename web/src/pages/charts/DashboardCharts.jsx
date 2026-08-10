import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Section } from '../../components.jsx';
import { t } from '../../i18n.js';

/**
 * Las tres gráficas del Dashboard, en su propio módulo. El Dashboard es la
 * primera pantalla que se ve al entrar, y con recharts importado a pelo había
 * que bajar y ejecutar 400 KB antes de pintar los contadores y las novedades,
 * que son justo lo que se viene a mirar. Ahora la página sale entera y las
 * gráficas entran detrás.
 *
 * El tema (`ch`) llega por props: useChartTheme se queda en la página para que
 * este módulo no arrastre nada más que recharts.
 */
export default function DashboardCharts({ ch, byDecade, byGenre, addedByMonth }) {
  return (
    <>
      <Section title={t('Películas por década')} className="min-w-0">
        <div className="card p-4 h-72 min-w-0">
          <ResponsiveContainer>
            <BarChart data={byDecade} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <XAxis dataKey="decade" stroke={ch.axis} fontSize={12} tickMargin={6} />
              <YAxis stroke={ch.axis} fontSize={12} width={38} />
              <Tooltip contentStyle={ch.tooltip} labelStyle={ch.tooltipLabel} itemStyle={ch.tooltipItem} cursor={{ fill: ch.cursor }} />
              <Bar dataKey="n" name={t('Películas')} fill={ch.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
      <Section title={t('Géneros principales')} className="min-w-0">
        <div className="card p-4 h-72 min-w-0">
          <ResponsiveContainer>
            <BarChart data={byGenre.slice(0, 12)} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis type="number" stroke={ch.axis} fontSize={12} />
              <YAxis type="category" dataKey="name" width={110} stroke={ch.axis} fontSize={11} interval={0} tickMargin={4} />
              <Tooltip contentStyle={ch.tooltip} labelStyle={ch.tooltipLabel} itemStyle={ch.tooltipItem} cursor={{ fill: ch.cursor }} />
              <Bar dataKey="n" name={t('Películas')} fill={ch.ramp[1] || ch.accent} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
      <Section title={t('Crecimiento de la biblioteca (añadidas por mes)')} className="min-w-0">
        <div className="card p-4 h-72 min-w-0">
          <ResponsiveContainer>
            <LineChart data={addedByMonth} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <XAxis dataKey="month" stroke={ch.axis} fontSize={10} tickMargin={6} minTickGap={24} />
              <YAxis stroke={ch.axis} fontSize={12} width={38} />
              <Tooltip contentStyle={ch.tooltip} labelStyle={ch.tooltipLabel} itemStyle={ch.tooltipItem} cursor={{ stroke: ch.axis }} />
              <Line type="monotone" dataKey="n" name={t('Añadidas')} stroke={ch.accent} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </>
  );
}
