# Protano's Bakery · Reproceso manual de envío de facturas por SFTP
Contexto completo para desarrollo con Antigravity
Última actualización: 2026-11-26 · Desarrollador: Fabián Charris (Efficientix)

> **Fuente de verdad del proyecto:** Este documento centraliza todas las definiciones de arquitectura, requerimientos y pruebas. Para el inventario completo de objetos y despliegue técnico, consulte [Inventario_Tecnico_Protanos_SFTP.md](file:///d:/Efficientix/Desarrollo%20SFTP/Doc/Inventario_Tecnico_Protanos_SFTP.md).

---

## 1. Resumen y Flujo Arquitectónico

- **Objetivo:** Un Suitelet en NetSuite para que el área de facturación de Protano's Bakery seleccione una fecha y regenere/reenvíe el archivo CSV de facturas hacia su cliente final (**Flanigans**) por SFTP.
- **División de Responsabilidades:**
  1. **Suitelet UI (`EFX_PB_ReprocesoFacturas_SL.js`) + Client Script (`EFX_PB_ReprocesoFacturas_CS.js`):**
     - Formulario simple: Selección de Fecha y Cliente (`3375` por defecto).
     - Busca y valida que existan facturas para esa fecha.
     - Crea el registro de seguimiento en Bitácora (`customrecord_efx_pb_sftp_log`).
     - **Encola el Scheduled Script enviándole únicamente los IDs de las facturas** (`custscript_efx_pb_ids`) junto con `logId`, `fecha` y `cliente`.
     - Muestra la bitácora con sublista interactiva que consulta el estado real de la tarea NetSuite (`task.checkStatus`) y botón para refrescar estado.
  2. **Scheduled Script (`EFX_PB_ReprocesoFacturas_SS.js`):**
     - Recibe los IDs de las facturas y corre de forma 100% asíncrona en segundo plano.
     - Extrae la información detallada de las facturas (cabeceras y líneas).
     - Construye el archivo CSV con registros Header (H) y Detail (D).
     - Establece la conexión SFTP usando los parámetros del deployment (`N/sftp`).
     - Transmite el archivo al servidor SFTP (`replaceExisting: true`).
     - Marca las facturas en segundo plano con los 3 campos:
       - `custbody_efx_pb_enviado_sftp` = `T`
       - `custbody_efx_pb_fecha_envio_sftp` = Fecha y hora actual
       - `custbody_efx_pb_archivo_sftp` = Enlace al archivo CSV generado en File Cabinet.
     - Actualiza el registro de Bitácora a estado `OK` (o `Error`).
     - Envía el correo electrónico de resumen con el CSV adjunto.
  3. **Librerías de Soporte:**
     - `EFX_PB_Constantes_LIB.js`: Constantes de IDs de registros, campos, listas y scripts.
     - `EFX_PB_Envio_LIB.js`: Búsqueda detallada, formateo de CSV, marcado de facturas (3 campos) y envío de correo.
     - `EFX_PB_Transporte_LIB.js`: Respaldo en File Cabinet (`Protanos_Doc`) y adaptador `N/sftp`.

---

## 2. Servidores SFTP y Conectividad

### Servidor de Pruebas Activo (sftpcloud.io)
- **Host:** `a1f51.us-west-1.sftpcloud.io`
- **Puerto:** `22`
- **Usuario:** `297f480baeaa4835bc64c624beb02265`
- **Directorio Remoto:** `/`
- **Host Key Type:** `ecdsa`
- **Host Key Base64:** `AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBELYopkHc6vi++AqprGSo00zclDui4Ywj08QrnZgkLOF9v8PX8nlNErFMpnq9XyDGhYTKcWK/NtmeHYJIeQ89XM=`

---

## 3. Campos de Factura (Transaction Body Fields)

1. `custbody_efx_pb_enviado_sftp` (Checkbox - Enviado por SFTP)
2. `custbody_efx_pb_fecha_envio_sftp` (DateTime - Fecha y hora del envío)
3. `custbody_efx_pb_archivo_sftp` (Document - Archivo CSV generado en File Cabinet)

---

## 4. Backups Realizados

- **Backup Funcional 100%:** `d:\Efficientix\Desarrollo SFTP\Backup\Backup_20261126_SFTP_Working`
