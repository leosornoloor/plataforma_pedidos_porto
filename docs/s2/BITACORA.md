# Bitácora · Arquitecturas y procesos · Leo Sornoza

## Entorno

| Dato | Valor |
| --- | --- |
| Laptop (CPU, RAM) | MacBook Pro, Apple M1 de 8 núcleos, 8 GB de RAM |
| núcleos según `/metricas` | 8 |
| `MAX_TRABAJADORES` y `MAX_COLA` | 8 y 16 (valores predeterminados) |
| Duración de un reporte con `n=2000000` | 340 ms con un worker individual; resultado: 148933 primos |

## 1. Resultados

| Escenario | Latencia 50 % | Latencia máx. | Respuestas 2xx | Respuestas 503 | Timeouts | `bucle.maxMs` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 · bloqueo (`/health`) | 0 ms | 5012 ms | ≈118000 | 0 | 0 | 5012 ms |
| 2 · worker sin límite | 1956 ms | 4850 ms | 507 | 0 | 0 | 217 ms |
| 3 · pool con límite | 10 ms | 1646 ms | 474 | 43119 | 0 | 79 ms |

### Escenario 1 · bloqueo

Se ejecutó autocannon contra `/health` y, durante la carga, se solicitaron dos reportes bloqueantes. Cada reporte respondió 200 y tardó aproximadamente cinco segundos.

```text
Running 15s test @ http://localhost:3000/health
20 connections

bloqueante_1 status=200 tiempo=5.026855s
bloqueante_2 status=200 tiempo=5.035832s

Latency: 2.5%=0 ms, 50%=0 ms, 97.5%=2 ms, 99%=2 ms,
         Avg=1.9 ms, Stdev=81.79 ms, Max=5012 ms
Req/Sec: 1%=0, 2.5%=0, 50%=170, 97.5%=20399,
         Avg=7839.54, Stdev=9344.43, Min=170

118k requests in 15.02s, 31.9 MB read
```

Respuesta de `/metricas`:

```json
{
  "umbralLentaMs": 1000,
  "nucleos": 8,
  "bucle": {
    "p50Ms": 11,
    "p99Ms": 14,
    "maxMs": 5012
  },
  "rutas": [
    {
      "ruta": "GET /reporte/bloqueante",
      "peticiones": 2,
      "promedioMs": 5004.03,
      "maxMs": 5006.44,
      "lentas": 2
    },
    {
      "ruta": "GET /health",
      "peticiones": 117614,
      "promedioMs": 0.04,
      "maxMs": 9.16,
      "lentas": 0
    }
  ],
  "pool": {
    "maxTrabajadores": 8,
    "activos": 0,
    "enCola": 0,
    "maxCola": 16,
    "rechazadas": 0
  }
}
```

### Escenario 2 · un worker por petición, sin límite

```text
Running 20s test @ http://localhost:3000/reporte/worker?n=2000000
50 connections

Latency: 2.5%=893 ms, 50%=1956 ms, 97.5%=4221 ms, 99%=4345 ms,
         Avg=2055.32 ms, Stdev=784.74 ms, Max=4850 ms
Req/Sec: 1%=0, 2.5%=0, 50%=24, 97.5%=37,
         Avg=22.85, Stdev=9.88, Min=4

507 requests in 20.03s, 133 kB read
```

Respuesta de `/metricas`:

```json
{
  "umbralLentaMs": 1000,
  "nucleos": 8,
  "bucle": {
    "p50Ms": 12,
    "p99Ms": 50,
    "maxMs": 217
  },
  "rutas": [
    {
      "ruta": "GET /reporte/worker",
      "peticiones": 458,
      "promedioMs": 2001.6,
      "maxMs": 4671.33,
      "lentas": 429
    }
  ],
  "pool": {
    "maxTrabajadores": 8,
    "activos": 0,
    "enCola": 0,
    "maxCola": 16,
    "rechazadas": 0
  }
}
```

### Escenario 3 · pool con límite

```text
Running 20s test @ http://localhost:3000/reporte/pool?n=2000000
50 connections

Latency: 2.5%=2 ms, 50%=10 ms, 97.5%=36 ms, 99%=880 ms,
         Avg=22.18 ms, Stdev=103.85 ms, Max=1646 ms
Req/Sec: 1%=1346, 2.5%=1346, 50%=2215, 97.5%=2799,
         Avg=2179.95, Stdev=329.58, Min=1346

474 2xx responses, 43119 non 2xx responses
44k requests in 20.02s, 18.2 MB read
```

Las respuestas non 2xx fueron 503 generadas por `PoolLleno`.

Respuesta de `/metricas`:

```json
{
  "umbralLentaMs": 1000,
  "nucleos": 8,
  "bucle": {
    "p50Ms": 12,
    "p99Ms": 33,
    "maxMs": 79
  },
  "rutas": [
    {
      "ruta": "GET /reporte/pool",
      "peticiones": 43619,
      "promedioMs": 10.9,
      "maxMs": 1634.03,
      "lentas": 199
    }
  ],
  "pool": {
    "maxTrabajadores": 8,
    "activos": 0,
    "enCola": 0,
    "maxCola": 16,
    "rechazadas": 43145
  }
}
```

## 2. Análisis

### 1. Bloqueo del bucle frente a la métrica de `/health`

En el escenario 1, `bucle.maxMs` fue 5012 ms y el `maxMs` de `GET /health` fue solo 9.16 ms.
El monitor del bucle se ejecuta a nivel del proceso y detecta el intervalo completo en que Node no puede atender eventos.
El interceptor comienza a medir `/health` cuando Express finalmente recibe y procesa la petición, después de la espera previa.
Por eso el monitor ve el bloqueo de cinco segundos, mientras la métrica de la ruta solo ve el manejador rápido.

### 2. Saturación con un worker por petición

Autocannon completó 507 peticiones y no reportó timeouts en esta máquina durante los 20 segundos.
Un reporte aislado tardó 340 ms, pero con 50 simultáneos la latencia subió a p50 de 1956 ms y máximo de 4850 ms.
Los 50 workers compiten por solo 8 núcleos, provocando planificación, cambios de contexto y competencia por CPU y memoria.
Aunque aquí no se alcanzó el timeout, 429 de 458 rutas medidas superaron un segundo y muestran la degradación por saturación.

### 3. Rechazo inmediato frente a timeout

En el escenario 3 hubo 474 respuestas 2xx, 43119 respuestas 503 y ningún timeout reportado.
El 503 con `Retry-After: 1` es un fallo explícito de disponibilidad por sobrecarga y llega inmediatamente al cliente.
Un timeout es un fallo por omisión o por tiempo: el cliente no sabe si el servidor rechazó, sigue trabajando o completó la operación.
El rechazo rápido libera recursos y permite que el cliente reprograme la solicitud sin mantener conexiones esperando indefinidamente.

### 4. Cliente que ignora `Retry-After`

Autocannon ignoró `Retry-After` y volvió a enviar solicitudes inmediatamente, acumulando 43145 rechazos en el pool.
Esto generó unas 2179 solicitudes por segundo, casi todas inútiles, y añadió trabajo HTTP al servidor aunque protegió los workers.
Un cliente bien diseñado debe esperar al menos el segundo indicado, limitar reintentos y aplicar backoff exponencial con jitter.
Así evita una tormenta de reintentos y da tiempo para que disminuyan los trabajos activos y la cola.

### 5. Tres réplicas detrás de un balanceador

Con tres réplicas, `/metricas` mostraría solo los datos de la réplica que atendió esa consulta, no un total global.
Cada réplica permitiría 8 workers activos y 16 en cola; en total habría hasta 24 reportes ejecutándose y 48 esperando.
Los contadores, histogramas y rechazos también quedarían fragmentados y podrían variar entre consultas según el balanceador.
Usaría métricas agregadas externas y una cola compartida, además de definir un límite global acorde con la CPU disponible.

## 3. Problemas encontrados

- El repositorio no contenía `worker-reporte.ts` ni la ruta `/reporte/worker` de la práctica guiada; se reconstruyeron para poder comparar los tres modelos.
- El escenario 1 tuvo que coordinar autocannon y los reportes en el mismo proceso de terminal para asegurar que se ejecutaran simultáneamente.
- En el escenario 2 no hubo timeouts en este hardware, aunque la latencia aumentó notablemente; se conservaron los datos reales sin alterarlos.
- Las métricas basadas en `finish` no cuentan exactamente igual que autocannon cuando el cliente cierra conexiones al finalizar la ventana de carga.

## 4. Uso declarado de IA

Se utilizó OpenAI Codex como apoyo para reconstruir el worker faltante, implementar y revisar el pool, automatizar las mediciones y organizar la bitácora. También ayudó a interpretar los resultados y redactar el análisis. El código se compiló y los endpoints se probaron dentro de Docker; los valores presentados provienen de ejecuciones reales en el equipo indicado.
