# Experimento de métricas

## Resultado de `/health`

- Código HTTP: 200
- Tiempo observado en Chrome: 3.21 segundos
- Tiempo promedio registrado por el interceptor: 2.27 ms
- Tiempo máximo registrado por el interceptor: 5.73 ms

## Respuesta de `/metricas`

```json
{
  "umbralLentaMs": 1000,
  "rutas": [
    {
      "ruta": "GET /metricas",
      "peticiones": 4,
      "promedioMs": 6.36,
      "maxMs": 10.79,
      "lentas": 0
    },
    {
      "ruta": "GET /favicon.ico",
      "peticiones": 1,
      "promedioMs": 4.13,
      "maxMs": 4.13,
      "lentas": 0
    },
    {
      "ruta": "GET /reporte/bloqueante",
      "peticiones": 4,
      "promedioMs": 5006.68,
      "maxMs": 5014.42,
      "lentas": 4
    },
    {
      "ruta": "GET /health",
      "peticiones": 4,
      "promedioMs": 2.27,
      "maxMs": 5.73,
      "lentas": 0
    },
    {
      "ruta": "GET /.well-known/appspecific/com.chrome.devtools.json",
      "peticiones": 4,
      "promedioMs": 2.22,
      "maxMs": 3.33,
      "lentas": 0
    }
  ]
}
```

## Análisis

Chrome mide el tiempo completo desde que envía la petición hasta que recibe la respuesta.
El interceptor empieza a medir cuando Express finalmente puede procesar la petición.
Mientras el reporte bloquea el event loop, `/health` espera antes de entrar al interceptor.
Por eso Chrome registró 3.21 segundos y el interceptor solamente unos milisegundos.
El cliente percibe bloqueo del servicio o una respuesta muy lenta, aunque `/health` sea una ruta rápida.
