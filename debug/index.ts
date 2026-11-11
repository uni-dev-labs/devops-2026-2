function operacionCompleja(){
    console.time("operacionCompleja");
    console.log("Realizando operación compleja...");
    for (let i = 0; i < 1e7; i++) {
        Math.sqrt(i);
    }
    console.timeEnd("operacionCompleja");
}

function operacionA(){
    operacionCompleja();
}

function operacionB(){
    operacionA();
}