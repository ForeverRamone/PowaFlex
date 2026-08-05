/**
 * Salud de los datos: con 12.000 películas, los emparejamientos malos y los
 * huérfanos son estadísticamente seguros, y hasta ahora solo se descubrían por
 * casualidad. Todo son consultas locales sobre lo ya guardado — cero red — y
 * cada hallazgo lleva su remedio al lado.
 */
import { db } from './db.js';
import { ratingsCoverage } from './mdblist.js';

const MES = 30 * 24 * 3600 * 1000;

export function dataHealth() {
  const sample = (sql, ...args) => db.prepare(sql).all(...args);

  // 1 · Películas sin ficha TMDB: fuera de notas, sagas, festivales y huecos
  const sinTmdb = sample(
    `SELECT rating_key, title, year FROM movies WHERE tmdb_id IS NULL ORDER BY title LIMIT 30`
  );
  const sinTmdbTotal = db.prepare('SELECT COUNT(*) n FROM movies WHERE tmdb_id IS NULL').get().n;

  // 2 · El mismo TMDB id en varias entradas de Plex: o ediciones legítimas
  // duplicadas, o el agente de Plex emparejó dos películas distintas a la misma
  const tmdbRepetido = sample(
    `SELECT tmdb_id, COUNT(*) n, GROUP_CONCAT(title, ' · ') titles
     FROM movies WHERE tmdb_id IS NOT NULL
     GROUP BY tmdb_id HAVING n > 1 ORDER BY n DESC LIMIT 30`
  );

  // 3 · Entradas de Letterboxd sin casar con nada (ni biblioteca ni TMDB)
  const lbSinEmparejar = db
    .prepare('SELECT COUNT(*) n FROM lb_entries WHERE movie_id IS NULL AND tmdb_id IS NULL')
    .get().n;
  const lbMuestras = sample(
    `SELECT DISTINCT title, year FROM lb_entries WHERE movie_id IS NULL AND tmdb_id IS NULL ORDER BY title LIMIT 30`
  );

  // 4 · Peticiones zombis: monitorizadas en Radarr sin archivo desde hace 6+ meses
  const seisM = new Date(Date.now() - 6 * MES).toISOString();
  const zombis = sample(
    `SELECT tmdb_id, title, year, added FROM radarr_movies
     WHERE monitored = 1 AND has_file = 0 AND added IS NOT NULL AND added < ?
     ORDER BY added LIMIT 30`,
    seisM
  );
  const zombisTotal = db
    .prepare('SELECT COUNT(*) n FROM radarr_movies WHERE monitored = 1 AND has_file = 0 AND added IS NOT NULL AND added < ?')
    .get(seisM).n;

  // 5 · Personas con emparejado no demostrado. OJO a la diferencia, que antes
  // se contaba junta y alarmaba de más: `tmdb_checked_at` con valor significa
  // que SÍ se buscó y ninguna ficha de TMDB compartía película con las tuyas
  // (ahí sí puede haber un homónimo); sin valor significa que aún no se ha
  // mirado — es el caso de casi todos, porque añadir a alguien a favoritos, o
  // desde un canon, le pone el id de TMDB pero no comprueba nada.
  const CONDICION = `p.tmdb_id IS NOT NULL AND COALESCE(p.tmdb_verified, 0) = 0`;
  const personasSinVerificar = sample(
    `SELECT p.id, p.name, COUNT(mp.movie_id) films, p.tmdb_checked_at FROM people p
     JOIN movie_people mp ON mp.person_id = p.id
     WHERE ${CONDICION}
     GROUP BY p.id ORDER BY p.tmdb_checked_at IS NULL, films DESC LIMIT 30`
  ).map((p) => ({ ...p, comprobado: !!p.tmdb_checked_at }));
  const cuenta = (extra) =>
    db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) n FROM people p JOIN movie_people mp ON mp.person_id = p.id
         WHERE ${CONDICION} ${extra}`
      )
      .get().n;
  const personasTotal = cuenta('');
  const personasFallidas = cuenta('AND p.tmdb_checked_at IS NOT NULL');

  // 6 · Cobertura de notas de MDBList
  let notas = null;
  try {
    notas = ratingsCoverage();
  } catch {}

  return {
    generatedAt: Date.now(),
    sinTmdb: { total: sinTmdbTotal, sample: sinTmdb },
    tmdbRepetido: { total: tmdbRepetido.length, sample: tmdbRepetido },
    lbSinEmparejar: { total: lbSinEmparejar, sample: lbMuestras },
    radarrZombis: { total: zombisTotal, sample: zombis },
    personasSinVerificar: {
      total: personasTotal,
      fallidas: personasFallidas,
      sinComprobar: personasTotal - personasFallidas,
      sample: personasSinVerificar,
    },
    notas,
  };
}
