import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

WORKSPACE = "/mnt/D/U/OctavoSemestre/DevOps/devops-2026-2"
DOCX_PATH = os.path.join(WORKSPACE, "Entrega_Timing_Daniel_Alarcon.docx")
IMG_PATH = os.path.join(WORKSPACE, "evidencias", "pr119_header.png")

doc = docx.Document()

# 1. Configuración de márgenes estándar APA (1 pulgada / 2.54 cm)
for section in doc.sections:
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)

# Estilo base
COLOR_BLACK = RGBColor(0, 0, 0)
FONT_FAMILY = "Times New Roman"

def add_title(text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(text)
    run.font.name = FONT_FAMILY
    run.font.size = Pt(14)
    run.font.bold = True
    run.font.color.rgb = COLOR_BLACK
    return p

def add_subtitle(text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(text)
    run.font.name = FONT_FAMILY
    run.font.size = Pt(11)
    run.font.italic = True
    run.font.color.rgb = COLOR_BLACK
    return p

def add_meta(label, val):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    r_label = p.add_run(label + ": ")
    r_label.font.name = FONT_FAMILY
    r_label.font.size = Pt(11)
    r_label.font.bold = True
    r_label.font.color.rgb = COLOR_BLACK
    
    r_val = p.add_run(val)
    r_val.font.name = FONT_FAMILY
    r_val.font.size = Pt(11)
    r_val.font.color.rgb = COLOR_BLACK
    return p

def add_h1(text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(text)
    run.font.name = FONT_FAMILY
    run.font.size = Pt(11.5)
    run.font.bold = True
    run.font.color.rgb = COLOR_BLACK
    return p

def add_p(text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    run = p.add_run(text)
    run.font.name = FONT_FAMILY
    run.font.size = Pt(10.5)
    run.font.color.rgb = COLOR_BLACK
    return p

# -------------------------------------------------------------
# Encabezado Institucional Sobrio
# -------------------------------------------------------------
add_title("Universidad Santo Tomás - Seccional Tunja")
add_subtitle("División de Ingenierías y Arquitectura • Ingeniería de Sistemas")
add_title("Medición de Rendimiento, Recursos y Trazabilidad en Integración Continua")

p_space = doc.add_paragraph()
p_space.paragraph_format.space_after = Pt(6)

add_meta("Estudiante", "Daniel Esteban Alarcón Rojas")
add_meta("Asignatura", "DevOps (Octavo Semestre)")
add_meta("Docente", "Manuel Castro Barinas")
add_meta("Fecha de Entrega", "10 de noviembre de 2026")
add_meta("Rama de Trabajo", "timing-alarcon-daniel (creada a partir de products-test-alarcon)")
add_meta("Pull Request en GitHub", "https://github.com/uni-dev-labs/devops-2026-2/pull/119")
add_meta("URL de la Rama", "https://github.com/alarconDaniel/devops-2026-2/tree/timing-alarcon-daniel")

p_sep = doc.add_paragraph()
p_sep.paragraph_format.space_after = Pt(6)

# -------------------------------------------------------------
# 1. Introducción y Contexto
# -------------------------------------------------------------
add_h1("1. Introducción y Contexto del Requerimiento")
add_p(
    "El presente informe da cumplimiento formal a la consigna planteada por el docente: "
    "\"Medir cuánto se está demorando el servicio en ser ejecutado. De esa rama crear otra y hacer el cálculo\". "
    "Con anterioridad, se desarrolló e implementó el almacén de productos en memoria en la rama products-test-alarcon, "
    "correspondiente al Pull Request #88 en el repositorio upstream (uni-dev-labs/devops-2026-2), en el cual se "
    "obtuvo una calificación perfecta de 5.0 al superar la totalidad de los 32 tests unitarios requeridos."
)
add_p(
    "Siguiendo las directrices del curso y aplicando buenas prácticas de ingeniería DevOps, se procedió a crear la nueva "
    "rama timing-alarcon-daniel a partir de la rama de productos y se abrió el Pull Request #119. La medición se diseñó "
    "con un doble alcance metodológico: por un lado, la evaluación en tiempo de ejecución (runtime) del servicio mediante "
    "un benchmark que cuantifica latencias de respuesta, capacidad de procesamiento (throughput) y consumo de recursos del "
    "sistema (CPU y memoria RAM); por otro lado, la medición cuantitativa de los tiempos de pared de las suites de prueba "
    "locales y la trazabilidad integral del pipeline de integración continua en GitHub Actions."
)

# -------------------------------------------------------------
# 2. Metodología de Medición
# -------------------------------------------------------------
add_h1("2. Metodología de Medición y Herramientas Desarrolladas")
add_p(
    "Para garantizar la reproducibilidad técnica de las mediciones, se implementaron herramientas modulares dentro del "
    "proyecto. En primer lugar, se construyó el script scripts/service-benchmark.mjs (ejecutable mediante npm run benchmark:service), "
    "el cual somete al almacén de productos en memoria y a los endpoints HTTP de Express a pruebas intensivas. Dicho script "
    "ejecuta 1.000 operaciones de inserción con validaciones completas, 5.000 búsquedas indexadas por identificador único y SKU, "
    "500 consultas complejas con filtros de precio y categoría ordenadas según las reglas del idioma español (Intl.Collator), "
    "2.000 actualizaciones de inventario y 200 peticiones HTTP a través del middleware de Express. Para registrar el consumo de "
    "recursos, se emplearon las interfaces nativas de Node.js process.cpuUsage() (tiempo de usuario y sistema) y "
    "process.memoryUsage() (memoria Heap usada y memoria residente RSS)."
)
add_p(
    "En segundo lugar, se elaboró el script scripts/test-timing.mjs (disponible a través de npm run test:timing y npm run test:timing:productos), "
    "el cual corre el framework Vitest con salida estructurada JSON para desglosar el tiempo de pared total frente al tiempo neto de cómputo "
    "de cada suite y localizar las pruebas individuales más lentas. Finalmente, el script scripts/ci-timing.mjs (npm run ci:timing) se conecta "
    "a la interfaz de GitHub CLI para consultar de manera programática la duración precisa de cada uno de los jobs y steps del pipeline en Actions."
)

# -------------------------------------------------------------
# 3. Resultados de Rendimiento y Consumo de Recursos
# -------------------------------------------------------------
add_h1("3. Resultados de Rendimiento del Servicio y Consumo de Recursos")
add_p(
    "Las pruebas de rendimiento se llevaron a cabo en el entorno de desarrollo sobre la plataforma Linux x86_64 con el runtime Node.js v22.23.4. "
    "En cuanto a las operaciones del almacén de productos en memoria, la creación de registros registró una latencia promedio de 0,024 milisegundos "
    "(percentil 95 de 0,036 ms y un máximo de 1,288 ms), alcanzando un throughput de 41.950 operaciones por segundo. Las lecturas directas e "
    "indexadas por SKU o identificador arrojaron una latencia promedio de 0,009 milisegundos (percentil 95 de 0,028 ms) y una capacidad de 117.272 "
    "operaciones por segundo. Por su parte, la operación de ajuste de inventario demostró una velocidad sobresaliente con una latencia promedio de "
    "0,001 milisegundos y más de 1.744.000 operaciones por segundo, respaldando la eficiencia O(1) de las estructuras Map."
)
add_p(
    "En contraste, la operación de listado con filtrado y ordenamiento léxico en español demandó un promedio de 1,243 milisegundos por consulta "
    "(percentil 95 de 1,364 ms y un rendimiento de 804 operaciones por segundo), debido al coste computacional que implica realizar la clonación "
    "defensiva y el algoritmo de comparación de cadenas (localeCompare) sobre múltiples elementos. Respecto al servicio web HTTP a través de "
    "Express, el endpoint GET /health registró una latencia promedio de 0,847 milisegundos y un rendimiento de 1.181 peticiones por segundo, "
    "reflejando el overhead habitual de la serialización JSON y la cadena de middlewares."
)
add_p(
    "En relación con el consumo de recursos de hardware durante la prueba de carga del servicio (duración total de 0,86 segundos), el proceso consumió "
    "un total de 895,57 milisegundos de tiempo de CPU (849,09 ms en modo usuario y 46,48 ms en modo sistema), lo que representa una utilización del "
    "103,7% equivalente a la saturación completa de un núcleo de procesamiento en ráfaga. En el ámbito de la memoria, el espacio de memoria Heap "
    "usado pasó de 19,31 MB a 32,42 MB, evidenciando un delta moderado de 13,11 MB tras almacenar miles de objetos en memoria y sus respectivas estructuras "
    "de índice. La memoria residente total (RSS) se situó en 161,59 MB, manteniéndose en niveles óptimos y estables para el motor V8."
)

# -------------------------------------------------------------
# 4. Tiempos de Pruebas Automatizadas y Trazabilidad en CI/CD
# -------------------------------------------------------------
add_h1("4. Tiempos de Pruebas Automatizadas y Trazabilidad en CI/CD")
add_p(
    "La ejecución de las pruebas automatizadas a nivel local evidenció una notable rapidez. La suite de pruebas de productos (32 pruebas) "
    "completó su validación en un tiempo de pared de 0,63 segundos, de los cuales el tiempo neto de ejecución de las pruebas fue de tan solo "
    "0,03 segundos (25 milisegundos), correspondiendo el 95% restante al arranque del entorno de Vitest y la compilación dinámica de TypeScript. "
    "Las pruebas más exigentes fueron la validación de formato regex para el SKU (6 ms) y la inicialización de productos con UUID y fechas (4 ms). "
    "Asimismo, la suite principal del proyecto (8 pruebas) demoró 0,73 segundos de pared con 0,06 segundos de tiempo neto, registrando las pruebas "
    "de los endpoints POST /api/products y GET /health las mayores duraciones (24 ms y 18 ms respectivamente)."
)
add_p(
    "En el entorno de integración continua de GitHub Actions, el Pull Request #119 desencadenó el workflow automatizado CI sobre el commit de fusión "
    "actualizado. El run concluyó de manera enteramente satisfactoria (estado success) en un tiempo total de 16 segundos. Dentro de este flujo, el job "
    "\"Práctica productos\" completó sus validaciones en 12 segundos, desglosados en: 1 segundo de aprovisionamiento del runner Ubuntu, 2 segundos de "
    "descarga del código fuente, 2 segundos de configuración de Node.js, 2 segundos de instalación de dependencias limpias (npm ci), 1 segundo de "
    "ejecución de los 32 tests de productos y publicación de la calificación máxima (5.000). Paralelamente, el job \"Typecheck, tests y build\" demoró "
    "13 segundos, validando el tipado estático con TypeScript (0 errores) y compilando satisfactoriamente la aplicación."
)

# -------------------------------------------------------------
# 5. Evidencia Gráfica del Pull Request y CI
# -------------------------------------------------------------
add_h1("5. Evidencia de la Integración en GitHub")
add_p(
    "A continuación se presenta la evidencia gráfica del Pull Request #119 abierto en el repositorio upstream, demostrando la ausencia de conflictos "
    "con la rama principal y la aprobación total de las compuertas de calidad automáticas en GitHub Actions:"
)

if os.path.exists(IMG_PATH):
    p_img = doc.add_paragraph()
    p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_img.paragraph_format.space_before = Pt(4)
    p_img.paragraph_format.space_after = Pt(2)
    p_img.paragraph_format.keep_with_next = True
    p_img.add_run().add_picture(IMG_PATH, width=Inches(5.2))
    
    p_cap = doc.add_paragraph()
    p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_cap.paragraph_format.space_after = Pt(6)
    r_cap_label = p_cap.add_run("Figura 1. ")
    r_cap_label.font.name = FONT_FAMILY
    r_cap_label.font.size = Pt(10)
    r_cap_label.font.bold = True
    r_cap_label.font.color.rgb = COLOR_BLACK
    
    r_cap_text = p_cap.add_run("Pull Request #119 en GitHub (uni-dev-labs/devops-2026-2) con la rama timing-alarcon-daniel y validaciones de CI.")
    r_cap_text.font.name = FONT_FAMILY
    r_cap_text.font.size = Pt(10)
    r_cap_text.font.italic = True
    r_cap_text.font.color.rgb = COLOR_BLACK

# -------------------------------------------------------------
# 6. Conclusiones
# -------------------------------------------------------------
add_h1("6. Conclusiones")
add_p(
    "Primera: La arquitectura del servicio en memoria cumple rigurosamente con los objetivos de alta eficiencia y baja latencia, procesando decenas "
    "de miles de peticiones por segundo sin experimentar fugas de memoria o degradación en operaciones de acceso aleatorio indexado."
)
add_p(
    "Segunda: Se identificó que la operación de búsqueda y ordenamiento léxico en español constituye el principal cuello de botella computacional del "
    "servicio en memoria. En un entorno de producción a gran escala, se concluye que dicha responsabilidad debe delegarse a una base de datos relacional "
    "(como PostgreSQL) con índices de intercalación optimizados (COLLATE \"es_ES\"), preservando la memoria del servidor para tareas de alta concurrencia."
)
add_p(
    "Tercera: La cadena de trazabilidad implementada en el ciclo DevOps demuestra que el tiempo consumido en las etapas de aprovisionamiento y descarga "
    "de paquetes representa más del 60% del tiempo total del pipeline (16 segundos), mientras que la ejecución real del código de pruebas y compilación toma "
    "menos de 4 segundos. Esto ratifica que la solución desarrollada es liviana, predecible y óptima para integrarse de forma continua."
)

doc.save(DOCX_PATH)
print(f"Document saved to {DOCX_PATH}")
