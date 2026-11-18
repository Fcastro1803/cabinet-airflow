# Flujo de aire del gabinete

Simulador interactivo del flujo de aire dentro de un gabinete de PC. Acomodás los ventiladores, elegís la GPU, el CPU y su refrigeración, y ves cómo cambian la presión interna y las temperaturas.

**Probalo online:** https://flujo-aire-gabinete.vercel.app

> Es una herramienta para **comparar configuraciones entre sí** ("¿qué pasa si agrego una salida en el techo?"), no para predecir la temperatura exacta de una PC real. Las cifras en °C son estimaciones de un modelo simplificado.

## Cómo se usa

La vista es lateral, con el gabinete visto de costado.

**Ventiladores del gabinete**
- **Arrastrar** un ventilador lo mueve por las paredes (frente, techo, piso o pared trasera). Siempre queda pegado a la pared más cercana.
- **Clic** sobre un ventilador cambia entre **entrada** (azul, mete aire) y **salida** (naranja, saca aire).
- **Arrastrarlo fuera del gabinete** lo elimina.
- **+ Ventilador de entrada / de salida** agrega uno en el primer lugar libre.
- **Restablecer** vuelve a la configuración inicial: 3 entradas al frente, 1 salida atrás y 2 en el techo.
- **Poner frente a la derecha/izquierda** espeja el dibujo.

**Gabinete**
- **Tamaño:** mini torre (micro-ATX), media torre (ATX), torre completa (E-ATX) o personalizado (profundidad y altura).
- **Tapas PCI traseras ventiladas:** si las tapas de las ranuras libres tienen agujeros.
- **Temperatura ambiente:** de 15 a 40 °C.

**GPU:** modelo (o consumo en watts a mano), cantidad de ventiladores (1, 2 o 3), si están encendidos y la carga de trabajo (0–100%).

**CPU:** modelo (o watts a mano), tipo de refrigeración y carga de trabajo.

**Curva de ventiladores de la GPU:** 5 puntos arrastrables que indican a qué velocidad (%) giran los ventiladores según la temperatura de la GPU, como en las utilidades de las placas de video.

Debajo del dibujo se muestra un resumen: cantidad de entradas y salidas, tipo de presión, temperatura del CPU y la GPU, velocidad de los ventiladores de la GPU y temperatura del aire que sale.

**Ayuda:** el botón «Ayuda» junto al título abre una guía con secciones: primeros pasos, ventiladores, gabinete y ambiente, GPU y su curva, CPU y refrigeración, cómo leer la simulación e ideas para probar.

**Tema:** junto al título se elige **Claro**, **Oscuro** o **Sistema** (sigue al tema del sistema operativo). El cambio se anima con un círculo de borde difuminado que crece desde el centro (View Transitions API); en navegadores sin esa función, o con "reducir movimiento" activado, cambia al instante.

La configuración (ventiladores, tamaño, lado del frente, curva y tema) se guarda en el navegador de cada persona.

## Cómo funciona el modelo

### El aire
El aire se representa con cientos de partículas. Cada una:
- **Entra** por un ventilador de entrada, a la temperatura ambiente.
- **Se dirige** hacia una salida, esquivando la GPU, el disipador del CPU y la fuente.
- **Se calienta** cuando pasa por un componente, y **sube** si está más caliente que el ambiente (convección). Por eso el aire caliente tiende a irse por las salidas del techo.
- **Sale** por un ventilador de salida o por una rendija.

El color de cada partícula muestra su temperatura en una escala térmica: **azul → verde → amarillo → rojo**, de 22 °C a 95 °C. El CPU y la GPU usan la misma escala.

### Presión del gabinete
Se calcula comparando la cantidad de ventiladores de entrada y de salida:
- **Positiva** (más entradas): los ventiladores de entrada no logran meter todo su caudal porque el aire no tiene por dónde salir. El sobrante escapa por rendijas: pared trasera, techo y, si están ventiladas, tapas PCI.
- **Negativa** (más salidas): entra aire sin filtrar por las rendijas del frente y por las tapas PCI ventiladas.
- **Neutra:** igual cantidad de entradas y salidas.

Solo se cuenta la cantidad de ventiladores, no su tamaño, RPM ni la restricción de los filtros.

### Disposición de los componentes
- La **placa madre** se atornilla arriba y atrás, así que el CPU y el slot PCIe quedan siempre a la misma distancia de esa esquina, en cualquier tamaño de gabinete.
- La **GPU** va en el slot PCIe. Su chapa (bracket) queda atornillada a la pared trasera y la tarjeta se extiende hacia el frente.
- La **fuente** va abajo, contra la pared trasera. La pared trasera y el piso no admiten ventiladores en la zona de la fuente ni de las ranuras PCI.

### GPU
- **Diseño abierto** (open-air), el más común hoy: los ventiladores están en la cara inferior, aspiran aire desde abajo y lo pasan por el disipador.
- Los ventiladores generan **baja presión** debajo de la tarjeta y atraen aire desde el frente.
- El aire caliente **queda dentro del gabinete**, disperso: una parte sale por el extremo delantero, la mayoría por arriba de la tarjeta (hacia el CPU) y una pequeña parte por las rejillas del bracket, hacia afuera.
- **1, 2 o 3 ventiladores:** más ventiladores implican una tarjeta más larga, con un disipador más grande y más caudal.
- La **velocidad** de los ventiladores sigue la curva configurada, pero sube y baja de a poco, como un ventilador real.
- Las **tapas PCI ventiladas** están justo al lado de los ventiladores de la GPU. Cuando la presión no es positiva, la GPU aspira aire fresco de afuera a través de ellas.

### Refrigeración del CPU
- **Disipador de fábrica:** chico, con el ventilador mirando a la placa. El aire sale hacia los costados.
- **Torre de 1 ventilador:** el ventilador empuja el aire a través de las aletas, de adelante hacia atrás, en dirección al ventilador trasero.
- **Torre de 2 ventiladores (push-pull):** se agrega otro ventilador atrás que tira del aire. Pasa más aire y enfría mejor.
- **Refrigeración líquida (AIO):** el calor viaja por las mangueras hasta el **radiador**, montado en los ventiladores del techo (o del frente si no hay en el techo). Con el radiador al frente, el aire entra al gabinete ya tibio y calienta la GPU, como pasa en la realidad.

### Consumo y temperatura de los componentes
- Cada modelo de GPU y CPU tiene su **consumo aproximado a carga máxima** en watts. La carga (%) se aplica sobre ese consumo y, en reposo, el componente igual disipa un 15% de su máximo.
- El calor entra al **disipador**, y el aire que pasa se lleva una parte, según la diferencia de temperatura. Cuanto mejor es el flujo de aire, más fresco queda.
- El **chip** siempre está más caliente que su disipador. La diferencia crece con el consumo: es la resistencia térmica del encapsulado, la pasta y la base. En las GPU grandes esa resistencia por watt es menor, porque el chip reparte mejor el calor. La temperatura que se muestra es la del chip.
- Los fabricantes **dimensionan el disipador de la GPU según su consumo**. Por eso una GPU de 450 W no termina siempre en rojo.
- A 95 °C o más, el componente se marca como **"al límite"**.

### Temperatura ambiente
El aire entra a la temperatura del cuarto, y los componentes suben o bajan con ella. Con la curva de ventiladores, la GPU compensa: en un cuarto fresco sus ventiladores giran más lento, y con calor aceleran hasta llegar al 100%.

## Limitaciones

- Es una simulación en 2D, vista de costado. No representa lo que pasa hacia el panel lateral ni los cables.
- No tiene en cuenta el volumen interno, el tamaño o las RPM de cada ventilador, los filtros de polvo ni la restricción de los frentes. Por ejemplo, en la mini torre la GPU puede dar más fresca porque los ventiladores del frente le quedan cerca, aunque en la realidad los gabinetes chicos suelen calentar más.
- Los watts de cada modelo son valores de referencia. Las versiones de fábrica con overclock consumen más.
- Los °C sirven para comparar configuraciones, no son medidas reales.

## Estructura

```
index.html   estructura de la página y controles
styles.css   colores, tipografía y diseño (tema claro y oscuro)
app.js       simulación, dibujo en canvas e interacción
```

No usa librerías ni servicios externos: funciona sin internet abriendo `index.html` en el navegador.

## Publicación

Está publicado en Vercel, conectado a este repositorio: cada *push* a `main` actualiza https://flujo-aire-gabinete.vercel.app automáticamente.
