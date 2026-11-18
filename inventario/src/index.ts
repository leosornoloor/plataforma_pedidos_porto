import express, {Request, Response} from "express";

const PORT = Number (process.env.PORT ?? 3001);
const RETARDO_MS =Number(process.env.RETARDO_MS ?? 0);
const stock = new Map<String, number>([
['MOUSE-USB', 40],
['Laptop-14', 5],
['Iphone 18', 5],
['Ipad', 6],
['Apple Watch', 5],
['AirPods', 5],
]);
const esperar = (ms:number) => new Promise<void>((r) => setTimeout(r,ms));
const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
    res.json({status: "ok", servicio: "inventario"});
});

app.get("/stock/:sku", async (req: Request<{sku:string}>, res: Response) => {
    if(RETARDO_MS > 0) await esperar (RETARDO_MS);
    const disponible = stock.get(req.params.sku);
    if(disponible === undefined){
        res.status(404).json({error: "SKU no encontrado" + req.params.sku});
        return; 
    } res.json({sku:req.params.sku, disponible});
});

app.post("/stock/:sku/reservar", async (req: Request<{sku: string}>, res: Response) =>{
    const {cantidad} = req.body ?? {};

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
        res.status(400).json({
            error: "La cantidad debe ser un entero mayor que 0"
        });
        return;
    }

    const sku = req.params.sku;

    if (!stock.has(sku)) {
        res.status(404).json({
            error: "SKU no encontrado",
            sku
        });
        return;
    }

    if (RETARDO_MS > 0) {
        await esperar(RETARDO_MS);
    }

    const disponible = stock.get(sku);

    if (disponible === undefined) {
        res.status(404).json({
            error: "SKU no encontrado",
            sku
        });
        return;
    }

    if (disponible < cantidad) {
        res.status(409).json({
            error: "Stock insuficiente",
            sku,
            disponible,
            solicitado: cantidad
        });
        return;
    }

    const restante = disponible - cantidad;
    stock.set(sku, restante);

    res.json({
        sku,
        reservado: cantidad,
        restante
    });
});

app.listen(PORT, () => {
    console.log(`Servicio inventario escuchando en puerto ${PORT} retraso ${RETARDO_MS} ms`)
});