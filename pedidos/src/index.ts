import express, {Request, Response} from "express";
import {randomUUID} from "node:crypto";
import {medirLatencia, resumenMetricas} from "./metricas";

const PORT = Number (process.env.PORT ?? 3000);
const INVENTARIO_URL = process.env.INVENTARIO_URL ?? "http://localhost:3001";
const TIMEOUT_MS = Number (process.env.TIMEOUT_MS ?? 2000);

interface Pedidos{
    id: string;
    sku: string;
    cantidad: number;
    creadoEn: string;
}
const pedidos: Pedidos[] = [];
const app = express();
app.use(express.json());
app.use(medirLatencia);

app.get("/health", (_req: Request, res: Response) => {
    res.json({status: "ok", servicio: "pedidos"});
});

app.get("/health/ready", async (_req: Request, res: Response) => {
    const inicio = performance.now();

    try {
        const respuesta = await fetch(
            INVENTARIO_URL + "/health",
            {
                signal: AbortSignal.timeout(1000)
            }
        );

        const ms = Math.round(performance.now() - inicio);

        if (!respuesta.ok) {
            res.status(503).json({
                status: "no-listo",
                inventario: "HTTP " + respuesta.status,
                ms
            });
            return;
        }

        res.status(200).json({
            status: "listo",
            inventario: "ok",
            ms
        });
    } catch (error) {
        const ms = Math.round(performance.now() - inicio);
        const e = error as Error & {
            cause?: {
                code?: string
            }
        };

        const motivo =
            e.name === "TimeoutError"
                ? "timeout de 1000 ms"
                : e.cause?.code ?? e.message;

        res.status(503).json({
            status: "no-listo",
            inventario: motivo,
            ms
        });
    }
});
app.get("/metricas", (_req: Request, res: Response) => {
    res.json(resumenMetricas());
});

app.get("/reporte/bloqueante", (_req: Request, res: Response) => {
    const hasta = performance.now() + 5000;

    while (performance.now() < hasta) {
        // Simula un cálculo pesado que bloquea el event loop.
    }

    res.json({
        status: "completado",
        tipo: "bloqueante"
    });
});

app.get("/pedidos", (_req: Request, res: Response) => {
    res.json(pedidos);
});

app.post("/pedidos", async(req: Request, res: Response) => {
    const {sku, cantidad} = req.body ?? {};
    if(typeof sku !== "string" || !Number.isInteger(cantidad) || cantidad <= 0){
        res.status(400).json({error: "sku y cantidad no son los tipos de datos correctos"});
        return;
    }
    const inicio = performance.now();
    try {
        const r = await fetch(INVENTARIO_URL + "/stock/" + encodeURIComponent(sku) + "/reservar", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({cantidad}),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        
        const detalle = await r.json();
        if(r.status===404){
            res.status(404).json(detalle);
            return;
        }
        
        if (r.status === 409) {
            res.status(409).json(detalle);
            return;
        }
        if (!r.ok) {
            res.status(502).json({
                error: "Inventario respondió con un error",
                detalle
            });
        return;
        }

        const pedido: Pedidos = {id: randomUUID(), sku, cantidad, creadoEn: new Date().toISOString()};
        pedidos.push(pedido);
        res.status(201).json(pedido);

    } catch (error){
        const duracionMS = Math.round(performance.now()-inicio);
        const e = error as Error & {cause ?: {code?: string}};
        const motivo = e.name === "TimeoutError" ? "inventario no respondido en " +TIMEOUT_MS + "ms": 
        "No se pudo conectar con Inventario " + (e.cause?.code ?? e.message);
        console.error("pedidos " + motivo);
        res.status(503).json({error: "inventario no disponible ", motivo, duracionMS});
    }
});

app.listen(PORT, () => {
    console.log("pedidos en puerto " + PORT +" INVENTARIO EN "+ INVENTARIO_URL + " TIMEOUT_MS " + TIMEOUT_MS)
});