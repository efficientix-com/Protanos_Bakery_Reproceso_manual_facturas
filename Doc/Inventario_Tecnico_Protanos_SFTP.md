# Inventario Técnico · Integración SFTP Protano's Bakery
**Proyecto:** Reproceso y Envío Manual/Automático de Facturas por SFTP (Flanigans)  
**Cliente:** Protano's Bakery  
**Proveedor / Autor:** Efficientix (EFX)  
**Desarrollador:** Fabián Charris  
**Fecha de Creación:** 2026-11-26  
**Versión:** 1.0.0 (Lista para despliegue en entorno de cliente)  

---

## 1. Resumen de la Solución

La solución permite a los usuarios de facturación de Protano's Bakery regenerar y transmitir archivos de facturas electrónicas/comerciales en formato CSV estructurado (cabeceras `H` y líneas de detalle `D`) hacia el servidor SFTP de su cliente (**Flanigans**).

### Arquitectura de Procesamiento Asíncrono
```
┌────────────────────────────────┐
│   Suitelet UI                  │
│   (EFX_PB_ReprocesoFacturas_SL)│ ◄─── Usuario selecciona fecha / cliente
└───────────────┬────────────────┘
                │
                │ 1. Valida facturas y crea registro en Bitácora
                │ 2. Encola Scheduled Script pasando solo IDs
                ▼
┌────────────────────────────────┐
│   Scheduled Script             │
│   (EFX_PB_ReprocesoFacturas_SS)│ ◄─── Ejecución en segundo plano (Asíncrono)
└───────────────┬────────────────┘
                │
                ├─► Extrae líneas de detalle y formatea CSV (H/D)
                ├─► Guarda copia en File Cabinet (Carpeta: Protanos_Doc)
                ├─► Transmite CSV vía SFTP (N/sftp)
                ├─► Marca Facturas (Enviado=T, Fecha, Enlace Documento)
                ├─► Actualiza Bitácora (customrecord_efx_pb_sftp_log) a OK / Error
                └─► Envía Correo de Notificación con CSV adjunto
```

---

## 2. Inventario de Objetos SDF (XML)

Todos los objetos están empaquetados bajo SuiteCloud Development Framework (SDF) en el directorio `src/Objects/`.

### 2.1. Campos Personalizados de Transacción (Factura / Invoice)

| ID de Objeto XML | ID de Script (Script ID) | Nombre en UI | Tipo de Campo | Descripción / Uso |
|---|---|---|---|---|
| `custbody_efx_pb_enviado_sftp.xml` | `custbody_efx_pb_enviado_sftp` | EFX - Enviado por SFTP | `CHECKBOX` | Indica si la factura ya fue transmitida exitosamente por SFTP. Solo lectura en UI. |
| `custbody_efx_pb_fecha_envio_sftp.xml` | `custbody_efx_pb_fecha_envio_sftp` | EFX - Fecha Envío SFTP | `DATETIMETZ` | Fecha y hora exacta de la transmisión SFTP exitosa. |
| `custbody_efx_pb_archivo_sftp.xml` | `custbody_efx_pb_archivo_sftp` | EFX - Archivo SFTP Generado | `DOCUMENT` | Enlace directo al archivo CSV generado en el File Cabinet que contiene esta factura (para auditoría). |

### 2.2. Listas Personalizadas

| ID de Objeto XML | ID de Script | Nombre | Valores / IDs Internos |
|---|---|---|---|
| `customlist_efx_pb_estado_envio.xml` | `customlist_efx_pb_estado_envio` | EFX - PB Estado Envío SFTP | 1: `Pendiente`<br/>2: `En proceso`<br/>3: `Completado (OK)`<br/>4: `Error` |

### 2.3. Registros Personalizados (Custom Records - Bitácora)

| ID de Objeto XML | ID de Script | Nombre | Descripción |
|---|---|---|---|
| `customrecord_efx_pb_sftp_log.xml` | `customrecord_efx_pb_sftp_log` | EFX - PB Log Envío SFTP | Registro de auditoría y trazabilidad histórica de cada ejecución SFTP (manual o automática). |

#### Campos del Registro de Bitácora (`customrecord_efx_pb_sftp_log`)
| ID de Campo | Etiqueta | Tipo | Descripción |
|---|---|---|---|
| `custrecord_efx_pb_log_fecha_solicitada` | Fecha Solicitada | `DATE` | Fecha de las facturas seleccionadas para reproceso |
| `custrecord_efx_pb_log_cliente` | Cliente | `TEXT` | ID o nombre del cliente destino (ej: 3375 - Flanigans) |
| `custrecord_efx_pb_log_usuario` | Usuario Solicitante | `SELECT` (Employee) | Usuario que disparó el reproceso |
| `custrecord_efx_pb_log_inicio` | Fecha/Hora Inicio | `DATETIMETZ` | Momento en que se encoló la tarea |
| `custrecord_efx_pb_log_fin` | Fecha/Hora Fin | `DATETIMETZ` | Momento en que finalizó la ejecución |
| `custrecord_efx_pb_log_task_id` | ID Tarea NetSuite | `TEXT` | Task ID asignado por el motor de colas de NetSuite |
| `custrecord_efx_pb_log_estado` | Estado | `SELECT` (`customlist_efx_pb_estado_envio`) | Estado actual: Pendiente, En proceso, Completado o Error |
| `custrecord_efx_pb_log_num_facturas` | Total Facturas | `INTEGER` | Cantidad de facturas agrupadas en el lote |
| `custrecord_efx_pb_log_ids_procesados` | Facturas Procesadas | `CLOBTEXT` | Lista de TranIDs/Números de factura procesados |
| `custrecord_efx_pb_log_nombre_archivo` | Nombre Archivo | `TEXT` | Nombre del archivo CSV transmitido |
| `custrecord_efx_pb_log_archivo` | Archivo Generado | `DOCUMENT` | Enlace al archivo CSV almacenado en File Cabinet |
| `custrecord_efx_pb_log_modo` | Modo de Envío | `TEXT` | `SFTP` o `SIMULACION` |
| `custrecord_efx_pb_log_detalle_error` | Detalle / Error | `CLOBTEXT` | Registro de errores técnicos o stack trace en caso de fallo |

### 2.4. Scripts y Deployments

| ID de Objeto XML | Script ID | Tipo | Deployments | Descripción |
|---|---|---|---|---|
| `customscript_efx_pb_reproceso_sl.xml` | `customscript_efx_pb_reproceso_sl` | Suitelet | `customdeploy_efx_pb_reproceso_sl` | Pantalla UI del reproceso manual y visualizador de bitácora en vivo. |
| `customscript_efx_pb_reproceso_cs.xml` | `customscript_efx_pb_reproceso_cs` | Client Script | Asociado al Suitelet | Validaciones del lado del cliente (confirmación y recarga de pantalla). |
| `customscript_efx_pb_reproceso_ss.xml` | `customscript_efx_pb_reproceso_ss` | Scheduled Script | 1. `customdeploy_efx_pb_reproceso_ss` (On-Demand / Reproceso)<br/>2. `customdeploy_efx_pb_envio_diario_ss` (Scheduled automático) | Procesador asíncrono de generación CSV, transporte SFTP, marcado y alertas. |

*(Nota: La utilidad `EFX_PB_Credenciales_SL.js` se encuentra aislada en `Tools/Credenciales_SFTP/` para ser usada únicamente por el equipo técnico durante la configuración inicial del GUID sin sobrecargar el paquete principal de producción).*

---

## 3. Inventario de Archivos SuiteScript (File Cabinet)

Ubicación en SuiteCloud / File Cabinet: `SuiteScripts/SFTP_Protanos/`

| Archivo | Tipo / Módulo | Descripción |
|---|---|---|
| `EFX_PB_Constantes_LIB.js` | Librería SuiteScript 2.1 | Centraliza IDs de scripts, campos, parámetros, valores por defecto y códigos de estado. |
| `EFX_PB_Envio_LIB.js` | Librería SuiteScript 2.1 | Lógica de negocio: búsqueda de facturas por fecha, formateo del CSV (H/D), marcado masivo y envío de correos de notificación. |
| `EFX_PB_Transporte_LIB.js` | Librería SuiteScript 2.1 | Manejo de File Cabinet (carpeta `Protanos_Doc`), módulo `N/sftp`, validación de host key, subida y modo simulación. |
| `EFX_PB_ReprocesoFacturas_SL.js` | Suitelet 2.1 | Formulario de usuario, validación de concurrencia, creación de registro de bitácora y despacho a cola Scheduled. Consulta de estado de tareas (`task.checkStatus`). |
| `EFX_PB_ReprocesoFacturas_CS.js` | Client Script 2.1 | Controlador de eventos UI: alerta de confirmación antes de enviar y función de refresco de página. |
| `EFX_PB_ReprocesoFacturas_SS.js` | Scheduled Script 2.1 | Orquestador principal de fondo: lee parámetros, genera CSV, transfiere por SFTP, actualiza bitácora y marca facturas. |
| `EFX_PB_Credenciales_SL.js` | Suitelet 2.1 | Interfaz segura para guardar la contraseña SFTP y obtener el `passwordGuid` restringido por dominio. |

---

## 4. Parámetros del Deployment Scheduled (`customdeploy_efx_pb_reproceso_ss`)

Estos parámetros se configuran en el Script Deployment y permiten adaptar el comportamiento entre entornos (Sandbox vs Producción) sin alterar código:

| Parámetro | Script ID | Tipo | Valor Recomendado / Descripción |
|---|---|---|---|
| **IDs Facturas** | `custscript_efx_pb_ids` | Long Text | Recibido dinámicamente desde el Suitelet |
| **Fecha Reproceso** | `custscript_efx_pb_fecha` | Free-Form Text | Recibido dinámicamente desde el Suitelet |
| **ID Bitácora** | `custscript_efx_pb_log_id` | Integer | Recibido dinámicamente desde el Suitelet |
| **Cliente Destino** | `custscript_efx_pb_customer_id` | Free-Form Text | ID interno del cliente (ej: `3375` Flanigans) |
| **SFTP Host** | `custscript_efx_pb_sftp_host` | Free-Form Text | Dominio / IP del servidor SFTP del cliente |
| **SFTP Puerto** | `custscript_efx_pb_sftp_port` | Integer | Puerto SFTP (ej: `22` o `2222`) |
| **SFTP Usuario** | `custscript_efx_pb_sftp_user` | Free-Form Text | Nombre de usuario SFTP provisto por Flanigans |
| **SFTP Directorio** | `custscript_efx_pb_sftp_dir` | Free-Form Text | Ruta remota de entrega (ej: `/upload` o `/`) |
| **SFTP Password GUID** | `custscript_efx_pb_sftp_pwd_guid` | Free-Form Text | GUID seguro generado con `EFX_PB_Credenciales_SL.js` |
| **SFTP Key ID** | `custscript_efx_pb_sftp_key_id` | Free-Form Text | *(Opcional)* ID del Secret / Llave Privada SSH |
| **SFTP Host Key** | `custscript_efx_pb_sftp_hostkey` | Free-Form Text | Fingerprint / Llave pública Base64 del servidor SFTP |
| **SFTP Host Key Type** | `custscript_efx_pb_sftp_hostkey_type` | Free-Form Text | Tipo de llave (`ecdsa` o `rsa`) |
| **Modo de Transporte** | `custscript_efx_pb_modo` | Free-Form Text | `SFTP` para transmisión real o `SIMULACION` para pruebas |
| **Correos Notificación** | `custscript_efx_pb_correos` | Free-Form Text | Correos separados por coma para recibir resumen con CSV adjunto |

---

## 5. Procedimiento de Despliegue en Entorno de Producción / Sandbox del Cliente

### Paso 1: Autenticación SDF en la Cuenta Destino
En la consola de comandos de la máquina de despliegue:
```powershell
Set-Location "d:\Efficientix\Desarrollo SFTP\SDF\SFTP_Integration"
suitecloud account:setup
```
*Seleccionar la cuenta de Protano's Bakery / Autenticar con Token TBA o Browser Login.*

### Paso 2: Creación de Carpeta en File Cabinet
1. Ir a **Documents > Files > File Cabinet**.
2. Crear la carpeta con nombre: `Protanos_Doc` (en la raíz de File Cabinet o en la ruta deseada).

### Paso 3: Despliegue de Objetos y Scripts con SDF
Ejecutar el despliegue del proyecto:
```powershell
cmd /c "suitecloud project:deploy"
```
*SDF creará automáticamente todos los campos de factura, listas, registro de bitácora, scripts y deployments.*

### Paso 4: Generación del Password GUID
1. Abrir en el navegador el Suitelet `customdeploy_efx_pb_credenciales_sl`.
2. Ingresar la contraseña del SFTP de Flanigans.
3. El Suitelet retornará el `Password GUID`.
4. Copiar este valor.

### Paso 5: Configuración de Parámetros en los Deployments
1. Ir a **Customization > Scripting > Script Deployments**.
2. Editar `customdeploy_efx_pb_reproceso_ss` y `customdeploy_efx_pb_envio_diario_ss`.
3. Establecer:
   - SFTP Host
   - SFTP Puerto
   - SFTP Usuario
   - SFTP Directorio
   - SFTP Password GUID (el generado en el paso 4)
   - SFTP Host Key
   - SFTP Host Key Type (`ecdsa` o `rsa`)
   - SFTP Modo (`SFTP`)
   - Correos de Notificación
   - Cliente por Defecto (ID del cliente Flanigans en esa cuenta)
4. Guardar.

### Paso 6: Prueba de Conectividad End-to-End
1. Abrir el Suitelet de Reproceso Manual: `customdeploy_efx_pb_reproceso_sl`.
2. Seleccionar una fecha con facturas existentes de Flanigans.
3. Presionar **Enviar Facturas por SFTP**.
4. Verificar en la bitácora que el estado pase a `Completado (OK)` y que el correo de notificación llegue con el CSV adjunto.
5. Comprobar en una de las facturas que los 3 campos (`custbody_efx_pb_enviado_sftp`, `custbody_efx_pb_fecha_envio_sftp` y `custbody_efx_pb_archivo_sftp`) hayan sido debidamente marcados.
