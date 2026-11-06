import { boot } from "./game.js";

try {
  boot();
} catch (error) {
  console.error("No se pudo iniciar Duelo de Magma:", error);
  const loading = document.getElementById("loading");
  if (loading) {
    loading.innerHTML = `<div style="font-family:monospace;color:#ffb07a;max-width:80vw;text-align:center">Error al cargar la arena.<br><small>${String(error)}</small></div>`;
  }
}
