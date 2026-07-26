/**
 * Lege stand-in voor het `server-only` pakket tijdens unit-tests.
 *
 * In een Next-build is `server-only` een marker die de build laat falen zodra
 * server-code per ongeluk in een client-bundle belandt. Buiten Next bestaat het
 * pakket niet, waardoor vitest elke module met die import weigert te laden.
 * Deze stub (via resolve.alias in vitest.config.ts) haalt die blokkade weg
 * zonder de bescherming in de echte build aan te tasten.
 */
export {};
