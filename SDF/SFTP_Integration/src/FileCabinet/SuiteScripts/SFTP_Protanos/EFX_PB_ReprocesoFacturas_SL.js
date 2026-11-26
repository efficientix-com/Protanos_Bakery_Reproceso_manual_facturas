/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Suitelet de Reproceso Manual de Envío de Facturas por SFTP - Protano's Bakery
 * Desarrollado por Efficientix (EFX)
 */
define([
    'N/ui/serverWidget',
    'N/ui/message',
    'N/task',
    'N/search',
    'N/record',
    'N/runtime',
    'N/format',
    'N/url',
    'N/redirect',
    'N/log',
    './EFX_PB_Constantes_LIB',
    './EFX_PB_Envio_LIB'
], (
    serverWidget,
    message,
    task,
    search,
    record,
    runtime,
    format,
    url,
    redirect,
    log,
    constantes,
    libEnvio
) => {

    /**
     * Controlador principal del Suitelet
     * @param {Object} context
     */
    const onRequest = (context) => {
        const { request, response } = context;

        if (request.method === 'GET') {
            handleGet(request, response);
        } else if (request.method === 'POST') {
            handlePost(request, response);
        }
    };

    /**
     * Renderiza el formulario con fecha, cliente por defecto, validaciones y bitácora
     * @param {Object} request
     * @param {Object} response
     */
    const handleGet = (request, response) => {
        const form = serverWidget.createForm({
            title: "Protano's Bakery · Reproceso Manual de Envío de Facturas por SFTP"
        });

        form.clientScriptModulePath = './EFX_PB_ReprocesoFacturas_CS.js';

        // Parámetros GET / Redirecciones
        const statusParam = request.parameters.status;
        const logIdParam = request.parameters.logId;
        const errorMsgParam = request.parameters.errorMsg;
        const numIdsParam = request.parameters.numIds;
        const fechaParam = request.parameters.fecha;
        const clienteParam = request.parameters.cliente;

        if (errorMsgParam) {
            form.addPageInitMessage({
                type: message.Type.ERROR,
                title: 'No se pudo iniciar el proceso',
                message: decodeURIComponent(errorMsgParam)
            });
        } else if (statusParam === 'submitted' && logIdParam) {
            form.addPageInitMessage({
                type: message.Type.CONFIRMATION,
                title: '✔ Solicitud de Reproceso Enviada a la Cola Exitosamente',
                message: `El reproceso de facturas para la fecha <b>${fechaParam || ''}</b> ha sido encolado con <b>${numIdsParam || 'X'} facturas agrupadas</b> (Registro en Bitácora <b>#${logIdParam}</b>).<br/>El Scheduled Script procesará la conexión y transmisión SFTP en segundo plano. Puedes presionar el botón <i>Actualizar Bitácora</i> para consultar el avance.`
            });
        }

        // Grupo de campos: Parámetros de Envío
        const fieldGroupFiltros = form.addFieldGroup({
            id: 'custpage_fg_filtros',
            label: 'Parámetros de Reproceso'
        });

        // 1. Campo Fecha (Default: Fecha enviada o día anterior)
        const fechaField = form.addField({
            id: 'custpage_fecha',
            type: serverWidget.FieldType.DATE,
            label: 'Fecha de Facturas a Reprocesar',
            container: 'custpage_fg_filtros'
        });
        fechaField.isMandatory = true;

        const hoy = new Date();
        const ayer = new Date(hoy);
        ayer.setDate(hoy.getDate() - 1);

        let fechaSeleccionada = ayer;
        if (fechaParam) {
            try {
                fechaSeleccionada = format.parse({ value: fechaParam, type: format.Type.DATE });
            } catch (eParse) {
                fechaSeleccionada = ayer;
            }
        }
        fechaField.defaultValue = fechaSeleccionada;

        const fechaDefStr = format.format({ value: fechaSeleccionada, type: format.Type.DATE });
        const clienteSeleccionado = clienteParam || constantes.CONFIG_DEFAULT.CLIENTE_DEFAULT;

        // 2. Campo Cliente Final (Lista de Clientes de NetSuite, Default: 3375)
        const clienteField = form.addField({
            id: 'custpage_cliente',
            type: serverWidget.FieldType.SELECT,
            source: 'customer',
            label: 'Cliente Final',
            container: 'custpage_fg_filtros'
        });
        clienteField.isMandatory = true;
        clienteField.defaultValue = clienteSeleccionado;

        // Botones
        form.addSubmitButton({
            label: 'Enviar Facturas por SFTP'
        });

        form.addButton({
            id: 'custpage_btn_refresh',
            label: 'Actualizar Bitácora',
            functionName: 'recargarPantalla'
        });

        // Sublista de Historial / Bitácora
        const sublist = form.addSublist({
            id: 'custpage_sublist_logs',
            type: serverWidget.SublistType.LIST,
            label: 'Historial Reciente de Reprocesos SFTP'
        });

        sublist.addField({ id: 'custpage_col_id', type: serverWidget.FieldType.TEXT, label: 'ID Log' });
        sublist.addField({ id: 'custpage_col_fecha_sol', type: serverWidget.FieldType.TEXT, label: 'Fecha Solicitada' });
        sublist.addField({ id: 'custpage_col_cliente', type: serverWidget.FieldType.TEXT, label: 'Cliente' });
        sublist.addField({ id: 'custpage_col_usuario', type: serverWidget.FieldType.TEXT, label: 'Usuario' });
        sublist.addField({ id: 'custpage_col_inicio', type: serverWidget.FieldType.TEXT, label: 'Inicio' });
        sublist.addField({ id: 'custpage_col_fin', type: serverWidget.FieldType.TEXT, label: 'Fin' });
        sublist.addField({ id: 'custpage_col_estado', type: serverWidget.FieldType.TEXT, label: 'Estado' });
        sublist.addField({ id: 'custpage_col_task_status', type: serverWidget.FieldType.TEXT, label: 'Estado Tarea NS' });
        sublist.addField({ id: 'custpage_col_num_facturas', type: serverWidget.FieldType.TEXT, label: 'N° Facturas' });
        sublist.addField({ id: 'custpage_col_ids', type: serverWidget.FieldType.TEXTAREA, label: 'IDs Agrupados' });
        sublist.addField({ id: 'custpage_col_archivo', type: serverWidget.FieldType.TEXT, label: 'Archivo Generado' });
        sublist.addField({ id: 'custpage_col_modo', type: serverWidget.FieldType.TEXT, label: 'Modo' });
        sublist.addField({ id: 'custpage_col_detalle', type: serverWidget.FieldType.TEXTAREA, label: 'Detalle / Error' });

        cargarHistorialSublista(sublist);

        response.writePage(form);
    };

    /**
     * Procesa la solicitud POST: agrupa IDs, valida bloqueo, crea bitácora y lanza Scheduled Script
     * @param {Object} request
     * @param {Object} response
     */
    const handlePost = (request, response) => {
        log.audit('handlePost:INICIO', `Iniciando handlePost. Parámetros recibidos: ${JSON.stringify(request.parameters)}`);
        try {
            const fechaStr = request.parameters.custpage_fecha;
            const clienteId = request.parameters.custpage_cliente || constantes.CONFIG_DEFAULT.CLIENTE_DEFAULT;
            const currentUser = runtime.getCurrentUser().id;

            log.audit('handlePost:PASO_1_PARAMETROS', `Fecha: [${fechaStr}], Cliente: [${clienteId}], Usuario: [${currentUser}]`);

            if (!fechaStr) {
                log.error('handlePost:PASO_1_ERROR', 'Fecha no especificada');
                redireccionarConError('Debe especificar una fecha válida.');
                return;
            }

            // 1. Validación de Concurrencia / Bloqueo
            log.audit('handlePost:PASO_2_BLOQUEO', `Verificando envíos en curso para fecha ${fechaStr}...`);
            const envioEnCurso = buscarEnvioEnCurso(fechaStr);
            if (envioEnCurso) {
                log.audit('handlePost:PASO_2_BLOQUEADO', `Envío en curso detectado: Log #${envioEnCurso.id}`);
                redireccionarConError(`Ya existe un reproceso en estado [${envioEnCurso.estado}] para la fecha ${fechaStr} (Log #${envioEnCurso.id}). Por favor espere a que finalice.`, fechaStr, clienteId);
                return;
            }

            // 2. Agrupar IDs de las facturas para esa fecha y cliente
            log.audit('handlePost:PASO_3_BUSQUEDA_FACTURAS', `Consultando facturas para fecha ${fechaStr} y cliente ${clienteId}...`);
            let resumen;
            try {
                resumen = libEnvio.obtenerResumenFacturasFecha({
                    fecha: fechaStr,
                    customerId: clienteId
                });
                log.audit('handlePost:PASO_3_RESULTADO', `Facturas encontradas: Total=${resumen.total}, Enviadas=${resumen.enviadas}, Pendientes=${resumen.pendientes}, IDs=[${resumen.ids.join(',')}]`);
            } catch (eResumen) {
                log.error('handlePost:PASO_3_ERROR_BUSQUEDA', `Error en obtenerResumenFacturasFecha: ${eResumen.name} - ${eResumen.message} - ${eResumen.stack}`);
                throw eResumen;
            }

            if (resumen.total === 0) {
                log.audit('handlePost:PASO_3_SIN_FACTURAS', `No se encontraron facturas para ${fechaStr} y cliente ${clienteId}`);
                redireccionarConError(`No se encontraron facturas para la fecha ${fechaStr} y Cliente ID ${clienteId}.`, fechaStr, clienteId);
                return;
            }

            const idsAgrupadosStr = resumen.ids.join(',');
            const tranidsAgrupadosStr = resumen.tranids && resumen.tranids.length > 0 ? resumen.tranids.join(', ') : idsAgrupadosStr;

            // 3. Crear registro en bitácora en estado PENDIENTE con IDs/TranIDs agrupados
            log.audit('handlePost:PASO_4_CREAR_LOG', 'Creando registro de bitácora en NetSuite...');
            let logId;
            try {
                const logRec = record.create({
                    type: constantes.RECORDS.LOG.ID,
                    isDynamic: false
                });

                const parsedDate = format.parse({ value: fechaStr, type: format.Type.DATE });
                const logName = `SFTP_${fechaStr.replace(/[^0-9]/g, '')}_${Date.now()}`;
                
                logRec.setValue({ fieldId: 'name', value: logName });
                logRec.setValue({ fieldId: constantes.RECORDS.LOG.FIELDS.FECHA_SOLICITADA, value: parsedDate });
                logRec.setValue({ fieldId: constantes.RECORDS.LOG.FIELDS.CLIENTE, value: clienteId.toString() });
                logRec.setValue({ fieldId: constantes.RECORDS.LOG.FIELDS.MODO, value: constantes.MODOS_TRANSPORTE.SFTP });
                
                if (currentUser && currentUser > 0) {
                    try {
                        logRec.setValue({ fieldId: constantes.RECORDS.LOG.FIELDS.USUARIO, value: currentUser });
                    } catch (eUser) {
                        log.error('handlePost:PASO_4_WARN_USUARIO', `No se pudo asignar usuario ${currentUser}: ${eUser.message}`);
                    }
                }
                
                logRec.setValue({ fieldId: constantes.RECORDS.LOG.FIELDS.INICIO, value: new Date() });
                
                try {
                    logRec.setValue({ fieldId: constantes.RECORDS.LOG.FIELDS.ESTADO, value: constantes.LISTS.ESTADO_ENVIO.VALORES.PENDIENTE });
                } catch (eEst) {
                    log.error('handlePost:PASO_4_WARN_ESTADO', `No se pudo asignar estado: ${eEst.message}`);
                }

                logRec.setValue({ fieldId: constantes.RECORDS.LOG.FIELDS.NUM_FACTURAS, value: resumen.total });
                logRec.setValue({ fieldId: constantes.RECORDS.LOG.FIELDS.IDS_PROCESADOS, value: tranidsAgrupadosStr });

                logId = logRec.save();
                log.audit('handlePost:PASO_4_LOG_CREADO', `Registro de bitácora guardado con ID #${logId}`);
            } catch (eLog) {
                log.error('handlePost:PASO_4_ERROR_CREAR_LOG', `Error al crear registro de bitácora: ${eLog.name} - ${eLog.message} - ${eLog.stack}`);
                throw eLog;
            }

            // 4. Encolar Scheduled Script pasándole los IDs y parámetros de negocio
            log.audit('handlePost:PASO_5_ENCOLAR_TASK', `Encolando Scheduled Script (${constantes.SCRIPTS.SCHEDULED.SCRIPT_ID} / ${constantes.SCRIPTS.SCHEDULED.DEPLOY_ID})...`);
            try {
                const scheduledTask = task.create({
                    taskType: task.TaskType.SCHEDULED_SCRIPT,
                    scriptId: constantes.SCRIPTS.SCHEDULED.SCRIPT_ID,
                    deploymentId: constantes.SCRIPTS.SCHEDULED.DEPLOY_ID,
                    params: {
                        [constantes.SCRIPTS.SCHEDULED.PARAMS.FECHA]: fechaStr,
                        [constantes.SCRIPTS.SCHEDULED.PARAMS.LOG_ID]: logId,
                        [constantes.SCRIPTS.SCHEDULED.PARAMS.CUSTOMER_ID]: clienteId,
                        [constantes.SCRIPTS.SCHEDULED.PARAMS.IDS]: idsAgrupadosStr,
                        [constantes.SCRIPTS.SCHEDULED.PARAMS.MODO]: constantes.MODOS_TRANSPORTE.SFTP
                    }
                });

                const taskId = scheduledTask.submit();
                log.audit('handlePost:PASO_5_TASK_ENVIADA', `Tarea Scheduled encolada exitosamente con taskId: ${taskId}`);

                try {
                    record.submitFields({
                        type: constantes.RECORDS.LOG.ID,
                        id: logId,
                        values: {
                            [constantes.RECORDS.LOG.FIELDS.TASK_ID]: taskId
                        }
                    });
                } catch (eSubFields) {
                    log.error('handlePost:PASO_5_WARN_TASK_ID', `No se pudo actualizar taskId en log #${logId}: ${eSubFields.message}`);
                }

                // Redirección PRG (Post/Redirect/Get) conservando parámetros y mostrando mensaje
                log.audit('handlePost:PASO_6_REDIRECT', `Redirigiendo a Suitelet con status=submitted, logId=${logId}`);
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        status: 'submitted',
                        logId: logId,
                        numIds: resumen.total,
                        fecha: fechaStr,
                        cliente: clienteId
                    }
                });
            } catch (taskError) {
                log.error('handlePost:PASO_5_ERROR_TASK', `Error al encolar la tarea: ${taskError.name} - ${taskError.message} - ${taskError.stack}`);
                
                if (logId) {
                    try {
                        record.submitFields({
                            type: constantes.RECORDS.LOG.ID,
                            id: logId,
                            values: {
                                [constantes.RECORDS.LOG.FIELDS.ESTADO]: constantes.LISTS.ESTADO_ENVIO.VALORES.ERROR,
                                [constantes.RECORDS.LOG.FIELDS.DETALLE_ERROR]: `Error al encolar tarea: ${taskError.message}`,
                                [constantes.RECORDS.LOG.FIELDS.FIN]: new Date()
                            }
                        });
                    } catch (eUpdErr) {
                        log.error('handlePost:PASO_5_ERROR_UPDATE_LOG', `No se pudo actualizar error en log: ${eUpdErr.message}`);
                    }
                }

                redireccionarConError(`No se pudo encolar la tarea Scheduled: ${taskError.message}`, fechaStr, clienteId);
            }

        } catch (e) {
            const errDetalle = `${e.name || 'Error'}: ${e.message || e.toString()}`;
            log.error('Suitelet:handlePost:ErrorGeneral', `${errDetalle} | Stack: ${e.stack} | Detalle: ${JSON.stringify(e)}`);
            redireccionarConError(`Error al procesar la solicitud: ${errDetalle}`, request.parameters.custpage_fecha, request.parameters.custpage_cliente);
        }
    };

    /**
     * Busca si ya hay un proceso para la misma fecha en estado Pendiente o En proceso
     * @param {string} fechaStr 
     * @returns {Object|null}
     */
    const buscarEnvioEnCurso = (fechaStr) => {
        try {
            const logSearch = search.create({
                type: constantes.RECORDS.LOG.ID,
                filters: [
                    [constantes.RECORDS.LOG.FIELDS.FECHA_SOLICITADA, 'on', fechaStr],
                    'AND',
                    [constantes.RECORDS.LOG.FIELDS.ESTADO, 'anyof', [
                        constantes.LISTS.ESTADO_ENVIO.VALORES.PENDIENTE,
                        constantes.LISTS.ESTADO_ENVIO.VALORES.EN_PROCESO
                    ]]
                ],
                columns: ['internalid', constantes.RECORDS.LOG.FIELDS.ESTADO]
            });

            const results = logSearch.run().getRange({ start: 0, end: 1 });
            if (results && results.length > 0) {
                return {
                    id: results[0].getValue({ name: 'internalid' }),
                    estado: results[0].getText({ name: constantes.RECORDS.LOG.FIELDS.ESTADO })
                };
            }
        } catch (e) {
            log.error('buscarEnvioEnCurso', `Error al consultar envíos en curso: ${e.message}`);
        }
        return null;
    };

    /**
     * Consulta los últimos 20 registros de la bitácora y los llena en la sublista
     * @param {serverWidget.Sublist} sublist 
     */
    const cargarHistorialSublista = (sublist) => {
        try {
            const fields = constantes.RECORDS.LOG.FIELDS;
            const logSearch = search.create({
                type: constantes.RECORDS.LOG.ID,
                columns: [
                    search.createColumn({ name: 'internalid', sort: search.Sort.DESC }),
                    fields.FECHA_SOLICITADA,
                    fields.CLIENTE,
                    fields.USUARIO,
                    fields.INICIO,
                    fields.FIN,
                    fields.ESTADO,
                    fields.TASK_ID,
                    fields.NUM_FACTURAS,
                    fields.IDS_PROCESADOS,
                    fields.NOMBRE_ARCHIVO,
                    fields.MODO,
                    fields.DETALLE_ERROR
                ]
            });

            const results = logSearch.run().getRange({ start: 0, end: 20 }) || [];

            results.forEach((res, index) => {
                const id = res.getValue({ name: 'internalid' }) || '';
                const fechaSol = res.getValue({ name: fields.FECHA_SOLICITADA }) || '';
                const cliente = res.getValue({ name: fields.CLIENTE }) || '';
                const usuario = res.getText({ name: fields.USUARIO }) || '';
                const inicio = res.getValue({ name: fields.INICIO }) || '';
                const fin = res.getValue({ name: fields.FIN }) || '';
                const estado = res.getText({ name: fields.ESTADO }) || '';
                const taskId = res.getValue({ name: fields.TASK_ID }) || '';
                const numFacturas = res.getValue({ name: fields.NUM_FACTURAS }) || '0';
                const idsProc = res.getValue({ name: fields.IDS_PROCESADOS }) || '';
                const nombreArchivo = res.getValue({ name: fields.NOMBRE_ARCHIVO }) || '';
                const modo = res.getValue({ name: fields.MODO }) || '';
                const detalle = res.getValue({ name: fields.DETALLE_ERROR }) || '';

                let nsTaskStatus = 'N/A';
                if (taskId) {
                    try {
                        const statusObj = task.checkStatus({ taskId: taskId });
                        nsTaskStatus = statusObj.status || 'DESCONOCIDO';
                    } catch (tErr) {
                        nsTaskStatus = 'ERROR_CHECK';
                    }
                }

                sublist.setSublistValue({ id: 'custpage_col_id', line: index, value: id.toString() });
                sublist.setSublistValue({ id: 'custpage_col_fecha_sol', line: index, value: fechaSol.toString() });
                if (cliente) sublist.setSublistValue({ id: 'custpage_col_cliente', line: index, value: cliente });
                if (usuario) sublist.setSublistValue({ id: 'custpage_col_usuario', line: index, value: usuario });
                if (inicio) sublist.setSublistValue({ id: 'custpage_col_inicio', line: index, value: inicio.toString() });
                if (fin) sublist.setSublistValue({ id: 'custpage_col_fin', line: index, value: fin.toString() });
                if (estado) sublist.setSublistValue({ id: 'custpage_col_estado', line: index, value: estado });
                if (nsTaskStatus) sublist.setSublistValue({ id: 'custpage_col_task_status', line: index, value: nsTaskStatus });
                sublist.setSublistValue({ id: 'custpage_col_num_facturas', line: index, value: numFacturas.toString() });
                if (idsProc) sublist.setSublistValue({ id: 'custpage_col_ids', line: index, value: idsProc.substring(0, 300) });
                if (nombreArchivo) sublist.setSublistValue({ id: 'custpage_col_archivo', line: index, value: nombreArchivo });
                if (modo) sublist.setSublistValue({ id: 'custpage_col_modo', line: index, value: modo });
                if (detalle) sublist.setSublistValue({ id: 'custpage_col_detalle', line: index, value: detalle.substring(0, 300) });
            });
        } catch (e) {
            log.error('cargarHistorialSublista', `Error al cargar historial: ${e.message}`);
        }
    };

    /**
     * Redirige al Suitelet mostrando mensaje de error y conservando valores seleccionados
     * @param {string} mensaje 
     * @param {string} [fecha]
     * @param {string} [cliente]
     */
    const redireccionarConError = (mensaje, fecha, cliente) => {
        const params = {
            errorMsg: encodeURIComponent(mensaje)
        };
        if (fecha) params.fecha = fecha;
        if (cliente) params.cliente = cliente;

        redirect.toSuitelet({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId,
            parameters: params
        });
    };

    return {
        onRequest: onRequest
    };
});
