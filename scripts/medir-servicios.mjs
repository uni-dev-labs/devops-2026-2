// Mide cuánto tarda en responder cada servicio y calcula promedio, mínimo y máximo.
// Uso: con Docker arriba (npm run docker:up), correr: node scripts/medir-servicios.mjs

const API_URL = "http://localhost:3000";
const VECES = 5;

const servicios = [
  { nombre: "API", ruta: "/health" },
  { nombre: "PostgreSQL", ruta: "/api/postgres/health" },
  { nombre: "MongoDB", ruta: "/api/mongo/health" },
  { nombre: "Productos", ruta: "/api/products" },
];

// Mide una sola petición en milisegundos
async function medir(ruta) {
  const inicio = performance.now();
  await fetch(API_URL + ruta);
  const fin = performance.now();
  return fin - inicio;
}

const resultados = [];

for (const servicio of servicios) {
  const tiempos = [];

  for (let i = 0; i < VECES; i++) {
    tiempos.push(await medir(servicio.ruta));
  }

  const suma = tiempos.reduce((total, t) => total + t, 0);

  resultados.push({
    servicio: servicio.nombre,
    "promedio (ms)": (suma / VECES).toFixed(2),
    "mínimo (ms)": Math.min(...tiempos).toFixed(2),
    "máximo (ms)": Math.max(...tiempos).toFixed(2),
  });
}

console.log(`Mediciones por servicio: ${VECES}\n`);
console.table(resultados);

const masLento = resultados.reduce((a, b) =>
  Number(a["promedio (ms)"]) > Number(b["promedio (ms)"]) ? a : b
);
console.log(`\nEl servicio más lento es ${masLento.servicio} con ${masLento["promedio (ms)"]} ms en promedio.`);
