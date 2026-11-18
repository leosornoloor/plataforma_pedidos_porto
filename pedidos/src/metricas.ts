import {Request, Response, NextFunction} from "express";

const UMBRAL_LENTA_MS = Number(
    process.env.UMBRAL_LENTA_MS ?? 1000
);

interface Estadistica {
    peticiones: number;
    totalMs: number;
    maxMs: number;
    lentas: number;
}

const porRuta = new Map<string, Estadistica>();

export function medirLatencia(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const inicio = performance.now();

    res.on("finish", () => {
        const ms = performance.now() - inicio;
        const clave = `${req.method} ${req.path}`;

        const estadistica = porRuta.get(clave) ?? {
            peticiones: 0,
            totalMs: 0,
            maxMs: 0,
            lentas: 0
        };

        estadistica.peticiones += 1;
        estadistica.totalMs += ms;
        estadistica.maxMs = Math.max(estadistica.maxMs, ms);

        if (ms > UMBRAL_LENTA_MS) {
            estadistica.lentas += 1;
        }

        porRuta.set(clave, estadistica);
    });

    next();
}

export function resumenMetricas() {
    return {
        umbralLentaMs: UMBRAL_LENTA_MS,
        rutas: [...porRuta].map(([ruta, estadistica]) => ({
            ruta,
            peticiones: estadistica.peticiones,
            promedioMs: Number(
                (estadistica.totalMs / estadistica.peticiones).toFixed(2)
            ),
            maxMs: Number(estadistica.maxMs.toFixed(2)),
            lentas: estadistica.lentas
        }))
    };
}