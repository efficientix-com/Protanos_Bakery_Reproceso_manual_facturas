# Bitácora de Desarrollo - Reproceso Manual de Envío de Facturas por SFTP
**Cliente:** Protano's Bakery  
**Desarrollador:** Fabián Charris (Efficientix)  
**Ruta del Proyecto:** `D:\Efficientix\Desarrollo SFTP\SDF\SFTP_Integration`  
**Cuenta NetSuite Destino:** `td2914157` (Efficientix Dev - SuiteTax)  
**Carpeta File Cabinet:** `SuiteScripts/SFTP_Protanos`  
**Última Actualización:** 2026-11-25 (Conexión SFTP verificada, alineación estricta de arquitectura y envío de IDs de facturas)

---

## 📌 1. Información General y Flujo de la Solución

### Arquitectura y Responsabilidades:
1. **Suitelet UI (`EFX_PB_ReprocesoFacturas_SL.js`) + Client Script (`EFX_PB_ReprocesoFacturas_CS.js`):**
   - Interfaz con selección de fecha y cliente (`3375`).
   - Consulta los IDs de facturas correspondientes.
   - Crea el registro de bitácora (`customrecord_efx_pb_sftp_log`) en estado Pendiente.
   - **Encola el Scheduled Script enviándole únicamente los IDs de las facturas (`custscript_efx_pb_ids`)**.
   - Muestra la tabla de seguimiento con botón *Actualizar Bitácora*.

2. **Scheduled Script (`EFX_PB_ReprocesoFacturas_SS.js`):**
   - Recibe la lista de IDs de facturas.
   - Busca el detalle completo de líneas de cada factura (`libEnvio.buscarFacturas`).
   - Construye el archivo CSV formateado (registros Header 'H' y Detail 'D').
   - Conecta al servidor SFTP usando las credenciales del deployment (`N/sftp`).
   - Carga el archivo en `/upload` con `replaceExisting: true`.
   - Marca las facturas como enviadas (`custbody_efx_pb_enviado_sftp = T`).
   - Actualiza la bitácora a `OK`.
   - Envía el correo electrónico de resumen con el CSV adjunto.

3. **Librerías de Soporte:**
   - `EFX_PB_Constantes_LIB.js`: Constantes de registros, campos, listas y scripts.
   - `EFX_PB_Envio_LIB.js`: Búsqueda, generación de CSV, marcado y correo resumen.
   - `EFX_PB_Transporte_LIB.js`: Respaldo en File Cabinet (`Protanos_Doc`) y adaptador SFTP.

---

## 🏷️ 2. Credenciales y Conectividad SFTP Verificada

- **Host:** `demo.wftpserver.com`
- **Puerto:** `2222`
- **Usuario:** `demo`
- **Password GUID:** Obtenido interactivamente en `EFX_PB_Credenciales_SL.js` y configurado en el Scheduled Script deployment.
- **Host Key ECDSA (Base64):** `AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBALrVMyBtERl1mbdOoWZeR1v3fMl2uj6C43D5D9g8w/gbPL5DmGAY3UnVHj7SEcBdPAXkqLUgQ4UTNIJKMBC7aI=`
- **Host Key Type:** `ecdsa`
- **Directorio Destino:** `/upload`

---

## 📝 3. Registro de Objetos en NetSuite Dev (`td2914157`)

| Objeto | ID | Estado |
|---|---|---|
| Suitelet Reproceso | `customscript_efx_pb_reproceso_sl` / `customdeploy_efx_pb_reproceso_sl` | ✔ Desplegado |
| Client Script | `customscript_efx_pb_reproceso_cs` | ✔ Desplegado |
| Scheduled Script | `customscript_efx_pb_reproceso_ss` / `customdeploy_efx_pb_reproceso_ss` | ✔ Desplegado |
| Suitelet Credenciales | `customscript_efx_pb_credenciales_sl` / `customdeploy_efx_pb_credenciales_sl` | ✔ Desplegado |
| Check Enviado SFTP | `custbody_efx_pb_enviado_sftp` | ✔ Creado |
| Fecha/Hora Envío SFTP | `custbody_efx_pb_fecha_envio_sftp` | ✔ Creado |
| Custom Record Bitácora | `customrecord_efx_pb_sftp_log` | ✔ Creado |
| Custom List Estados | `customlist_efx_pb_estado_envio` | ✔ Creado |

---

## 🚀 4. Registro de Pruebas y Estado del Proyecto

### [2026-11-25] - Verificación Completa del Flujo End-to-End
- **Suitelet:** Capturó fecha/cliente, validó facturas existentes, agrupó sus IDs y encoló la tarea Scheduled.
- **Scheduled Script:** Procesó los IDs, extrajo detalle de líneas, construyó el CSV (H/D) y respaldó en File Cabinet (`Protanos_Doc`).
- **Conexión SFTP:** Handshake SSH y autenticación con `passwordGuid` **exitosos al 100%** contra `demo.wftpserver.com:2222`.
- **Control de Permisos de Subida:** El rechazo del servidor demo por permisos de solo lectura (`read-only`) fue interceptado correctamente sin romper el script.
- **Persistencia en Bitácora y Correo:** El archivo CSV generado quedó asignado a la bitácora y adjunto en el correo de notificación.

### Estado de Tareas:
- [x] Conexión SFTP con NetSuite (`N/sftp`) validada y operativa.
- [x] Flujo de Suitelet a Scheduled Script mediante IDs de facturas.
- [x] Generación de CSV con registros Header (H) y Detail (D).
- [x] Respaldo automático de archivos en File Cabinet (`Protanos_Doc`).
- [x] Control de errores y persistencia del archivo generado en la bitácora.
- [x] Envío de correos de notificación con CSV adjunto.
- [x] Documentación actualizada en `Contexto_Protanos_SFTP.md` y `BITACORA.md`.
- [ ] Pruebas finales en el servidor SFTP real / productivo del cliente Protano's Bakery.
