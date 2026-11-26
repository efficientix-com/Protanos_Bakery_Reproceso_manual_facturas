/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * Scheduled Script para procesamiento en segundo plano del reproceso SFTP (Protano's Bakery)
 * Desarrollado por Efficientix (EFX)
 */
define([
    'N/runtime',
    'N/record',
    'N/log',
    './EFX_PB_Constantes_LIB',
    './EFX_PB_Envio_LIB',
    './EFX_PB_Transporte_LIB'
], (
    runtime,
    record,
    log,
    constantes,
    libEnvio,
    libTransporte
) => {

    /**
     * Ejecución del Scheduled Script
     * @param {Object} scriptContext
     */
    const execute = (scriptContext) => {
        const currentScript = runtime.getCurrentScript();
        const params = constantes.SCRIPTS.SCHEDULED.PARAMS;

        const fechaStr = currentScript.getParameter({ name: params.FECHA });
        const logId = currentScript.getParameter({ name: params.LOG_ID });
        const modo = currentScript.getParameter({ name: params.MODO }) || constantes.MODOS_TRANSPORTE.SFTP;
        const customerId = currentScript.getParameter({ name: params.CUSTOMER_ID }) || constantes.CONFIG_DEFAULT.CLIENTE_DEFAULT;
        const idsParam = currentScript.getParameter({ name: params.IDS });
        const correos = currentScript.getParameter({ name: params.CORREOS });

        // Parámetros de conexión SFTP desde el deployment
        const sftpHost = currentScript.getParameter({ name: params.SFTP_HOST });
        const sftpPort = currentScript.getParameter({ name: params.SFTP_PORT });
        const sftpUser = currentScript.getParameter({ name: params.SFTP_USER });
        const sftpDir = currentScript.getParameter({ name: params.SFTP_DIR });
        const sftpPwdGuid = currentScript.getParameter({ name: params.SFTP_PWD_GUID });
        const sftpKeyId = currentScript.getParameter({ name: params.SFTP_KEY_ID });
        const sftpHostKey = currentScript.getParameter({ name: params.SFTP_HOSTKEY });
        const sftpHostKeyType = currentScript.getParameter({ name: params.SFTP_HOSTKEY_TYPE });

        log.audit('Scheduled:execute', `Iniciando reproceso. Fecha: [${fechaStr}], Cliente: [${customerId}], LogId: [${logId}], Modo: [${modo}], IDs: [${idsParam || 'N/A'}]`);

        const sftpConfig = {
            url: sftpHost || constantes.SFTP_DEFAULT.URL,
            port: sftpPort ? parseInt(sftpPort, 10) : constantes.SFTP_DEFAULT.PORT,
            username: sftpUser || constantes.SFTP_DEFAULT.USER,
            passwordGuid: sftpPwdGuid,
            keyId: sftpKeyId,
            directory: sftpDir || constantes.SFTP_DEFAULT.DIR,
            hostKey: sftpHostKey || constantes.SFTP_DEFAULT.HOST_KEY,
            hostKeyType: sftpHostKeyType || constantes.SFTP_DEFAULT.HOST_KEY_TYPE
        };

        const idsArray = idsParam ? idsParam.split(',').map(id => id.trim()).filter(id => id.length > 0) : null;

        let archivoCsv = null;
        let nombreArchivo = null;

        try {
            // 1. Marcar bitácora como EN_PROCESO si existe logId
            if (logId) {
                record.submitFields({
                    type: constantes.RECORDS.LOG.ID,
                    id: logId,
                    values: {
                        [constantes.RECORDS.LOG.FIELDS.ESTADO]: constantes.LISTS.ESTADO_ENVIO.VALORES.EN_PROCESO
                    }
                });
            }

            // 2. Buscar facturas estructuradas (cabecera + detalle de líneas)
            const facturas = libEnvio.buscarFacturas({
                fecha: fechaStr,
                customerId: customerId,
                ids: idsArray
            });

            // 3. Caso: 0 facturas encontradas
            if (!facturas || facturas.length === 0) {
                log.audit('Scheduled:execute', `No se encontraron facturas para la fecha [${fechaStr}] y Cliente [${customerId}]. Finalizando.`);
                
                if (logId) {
                    record.submitFields({
                        type: constantes.RECORDS.LOG.ID,
                        id: logId,
                        values: {
                            [constantes.RECORDS.LOG.FIELDS.ESTADO]: constantes.LISTS.ESTADO_ENVIO.VALORES.SIN_FACTURAS,
                            [constantes.RECORDS.LOG.FIELDS.NUM_FACTURAS]: 0,
                            [constantes.RECORDS.LOG.FIELDS.FIN]: new Date(),
                            [constantes.RECORDS.LOG.FIELDS.DETALLE_ERROR]: 'Búsqueda finalizada: No se encontraron facturas con los criterios especificados.'
                        }
                    });
                }

                libEnvio.enviarResumen({
                    estado: 'SIN_FACTURAS',
                    fecha: fechaStr || 'N/A',
                    numFacturas: 0,
                    nombreArchivo: 'N/A',
                    modo: modo,
                    detalleError: 'No se encontraron facturas para los criterios de búsqueda.',
                    destinatarios: correos
                });

                return;
            }

            // 4. Generar archivo CSV con registros Header (H) y Detail (D)
            nombreArchivo = libEnvio.construirNombreArchivo({ fecha: fechaStr });
            archivoCsv = libEnvio.generarCsv({
                facturas: facturas,
                nombreArchivo: nombreArchivo
            });

            // 5. Enviar por el adaptador de transporte (sobrescribe con replaceExisting: true)
            const resultadoTransporte = libTransporte.enviar({
                archivo: archivoCsv,
                nombreArchivo: nombreArchivo,
                modo: modo,
                sftpConfig: sftpConfig,
                replaceExisting: true
            });

            // 6. Marcar facturas como enviadas por SFTP asociando el archivo
            const invoiceIds = facturas.map(f => f.internalId);
            const invoiceTranIds = facturas.map(f => f.tranId || f.internalId);
            const facturasMarcadas = libEnvio.marcarEnviadas({
                invoiceIds: invoiceIds,
                fileId: resultadoTransporte.fileId
            });

            // 7. Actualizar bitácora a OK con los resultados
            if (logId) {
                const updateValues = {
                    [constantes.RECORDS.LOG.FIELDS.ESTADO]: constantes.LISTS.ESTADO_ENVIO.VALORES.OK,
                    [constantes.RECORDS.LOG.FIELDS.NUM_FACTURAS]: facturas.length,
                    [constantes.RECORDS.LOG.FIELDS.IDS_PROCESADOS]: invoiceTranIds.join(', '),
                    [constantes.RECORDS.LOG.FIELDS.NOMBRE_ARCHIVO]: nombreArchivo,
                    [constantes.RECORDS.LOG.FIELDS.MODO]: modo,
                    [constantes.RECORDS.LOG.FIELDS.FIN]: new Date(),
                    [constantes.RECORDS.LOG.FIELDS.DETALLE_ERROR]: resultadoTransporte.mensaje || `Envío completado exitosamente. Facturas marcadas: ${facturasMarcadas}.`
                };

                if (resultadoTransporte.fileId) {
                    updateValues[constantes.RECORDS.LOG.FIELDS.ARCHIVO] = resultadoTransporte.fileId;
                }

                record.submitFields({
                    type: constantes.RECORDS.LOG.ID,
                    id: logId,
                    values: updateValues
                });
            }

            // 8. Enviar correo de resumen con resultado OK, detalle de facturas y archivo adjunto
            libEnvio.enviarResumen({
                estado: 'OK',
                fecha: fechaStr || 'N/A',
                numFacturas: facturas.length,
                nombreArchivo: nombreArchivo,
                modo: modo,
                facturas: facturas,
                adjunto: archivoCsv,
                destinatarios: correos
            });

            log.audit('Scheduled:execute', `Reproceso finalizado con éxito para Log #${logId || 'Manual'}. Total facturas: ${facturas.length}`);

        } catch (e) {
            log.error('Scheduled:execute:Error', `Error durante la ejecución del reproceso: ${e.message} - Stack: ${e.stack}`);

            if (logId) {
                try {
                    const errorUpdateValues = {
                        [constantes.RECORDS.LOG.FIELDS.ESTADO]: constantes.LISTS.ESTADO_ENVIO.VALORES.ERROR,
                        [constantes.RECORDS.LOG.FIELDS.FIN]: new Date(),
                        [constantes.RECORDS.LOG.FIELDS.DETALLE_ERROR]: `Error en procesamiento: ${e.message}`
                    };

                    const fileIdRespaldo = e.fileId || (archivoCsv && archivoCsv.id);
                    if (fileIdRespaldo) {
                        errorUpdateValues[constantes.RECORDS.LOG.FIELDS.ARCHIVO] = fileIdRespaldo;
                    }
                    if (nombreArchivo) {
                        errorUpdateValues[constantes.RECORDS.LOG.FIELDS.NOMBRE_ARCHIVO] = nombreArchivo;
                    }

                    record.submitFields({
                        type: constantes.RECORDS.LOG.ID,
                        id: logId,
                        values: errorUpdateValues
                    });
                } catch (recError) {
                    log.error('Scheduled:execute:UpdateError', `No se pudo actualizar el registro de bitácora a ERROR: ${recError.message}`);
                }
            }

            libEnvio.enviarResumen({
                estado: 'ERROR',
                fecha: fechaStr || 'N/A',
                numFacturas: 0,
                nombreArchivo: nombreArchivo || 'N/A',
                modo: modo,
                detalleError: e.message,
                adjunto: archivoCsv,
                destinatarios: correos
            });
        }
    };

    return {
        execute: execute
    };
});
