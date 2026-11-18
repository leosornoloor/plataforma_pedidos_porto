import {parentPort, workerData} from "node:worker_threads";

interface DatosWorker {
    n: number;
}

function esPrimo(valor: number): boolean {
    if (valor < 2) return false;
    if (valor === 2) return true;
    if (valor % 2 === 0) return false;

    for (let divisor = 3; divisor * divisor <= valor; divisor += 2) {
        if (valor % divisor === 0) return false;
    }

    return true;
}

function contarPrimos(n: number): number {
    let total = 0;

    for (let valor = 2; valor <= n; valor += 1) {
        if (esPrimo(valor)) total += 1;
    }

    return total;
}

const {n} = workerData as DatosWorker;

if (!Number.isSafeInteger(n) || n < 2) {
    throw new Error("n debe ser un entero mayor o igual que 2");
}

parentPort?.postMessage(contarPrimos(n));
