import {availableParallelism} from "node:os";
import {join} from "node:path";
import {Worker} from "node:worker_threads";

interface Trabajo {
    n: number;
    resolve: (resultado: number) => void;
    reject: (error: Error) => void;
}

function enteroPositivo(valor: string | undefined, respaldo: number): number {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : respaldo;
}

function enteroNoNegativo(
    valor: string | undefined,
    respaldo: number
): number {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero >= 0 ? numero : respaldo;
}

const maxTrabajadores = enteroPositivo(
    process.env.MAX_TRABAJADORES,
    availableParallelism()
);
const maxCola = enteroNoNegativo(
    process.env.MAX_COLA,
    maxTrabajadores * 2
);

const cola: Trabajo[] = [];
let activos = 0;
let rechazadas = 0;

export class PoolLleno extends Error {
    constructor() {
        super("El pool de reportes está lleno");
        this.name = "PoolLleno";
    }
}

function despachar(): void {
    while (activos < maxTrabajadores && cola.length > 0) {
        const trabajo = cola.shift();
        if (trabajo) iniciarTrabajo(trabajo);
    }
}

function iniciarTrabajo(trabajo: Trabajo): void {
    activos += 1;

    let worker: Worker;
    try {
        worker = new Worker(join(__dirname, "worker-reporte.js"), {
            workerData: {n: trabajo.n}
        });
    } catch (error) {
        activos -= 1;
        trabajo.reject(
            error instanceof Error ? error : new Error(String(error))
        );
        despachar();
        return;
    }

    let resultado: number | undefined;
    let fallo: Error | undefined;

    worker.once("message", (mensaje: unknown) => {
        if (typeof mensaje === "number") {
            resultado = mensaje;
        } else {
            fallo = new Error("El worker devolvió un resultado inválido");
        }
    });

    worker.once("error", (error) => {
        fallo = error instanceof Error ? error : new Error(String(error));
    });

    worker.once("exit", (codigo) => {
        activos -= 1;

        if (codigo === 0 && resultado !== undefined && !fallo) {
            trabajo.resolve(resultado);
        } else {
            trabajo.reject(
                fallo ?? new Error(`El worker terminó con código ${codigo}`)
            );
        }

        despachar();
    });
}

export function contarPrimosEnPool(n: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const trabajo: Trabajo = {n, resolve, reject};

        if (activos < maxTrabajadores) {
            iniciarTrabajo(trabajo);
            return;
        }

        if (cola.length < maxCola) {
            cola.push(trabajo);
            return;
        }

        rechazadas += 1;
        reject(new PoolLleno());
    });
}

export function estadoPool() {
    return {
        maxTrabajadores,
        activos,
        enCola: cola.length,
        maxCola,
        rechazadas
    };
}
