/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Módulo de negocio para búsqueda de facturas, generación de CSV (H/D),
 * actualización de campos y envío de correos de resumen (Protano's Bakery)
 * Desarrollado por Efficientix (EFX)
 */
define([
    'N/search',
    'N/record',
    'N/file',
    'N/email',
    'N/runtime',
    'N/format',
    'N/log',
    './EFX_PB_Constantes_LIB'
], (
    search,
    record,
    file,
    email,
    runtime,
    format,
    log,
    constantes
) => {

    /**
     * Obtiene el conteo de facturas para una fecha y cliente, separando enviadas y pendientes
     * @param {Object} options
     * @param {string} options.fecha
     * @param {string|number} [options.customerId]
     * @returns {Object} { total, enviadas, pendientes, ids, idsEnviados, idsPendientes }
     */
    const obtenerResumenFacturasFecha = (options) => {
        const { fecha, customerId } = options;
        if (!fecha) return { total: 0, enviadas: 0, pendientes: 0, ids: [], idsEnviados: [], idsPendientes: [] };

        const filters = [
            ['type', 'anyof', 'CustInvc'],
            'AND',
            ['mainline', 'is', 'T'],
            'AND',
            ['trandate', 'on', fecha]
        ];

        if (customerId) {
            filters.push('AND', ['entity', 'anyof', customerId]);
        }

        const columns = [
            search.createColumn({ name: 'internalid' }),
            search.createColumn({ name: 'tranid' }),
            search.createColumn({ name: constantes.TRANSACTION_FIELDS.ENVIADO_SFTP })
        ];

        const invSearch = search.create({
            type: search.Type.INVOICE,
            filters: filters,
            columns: columns
        });

        const ids = [];
        const tranids = [];
        const idsEnviados = [];
        const idsPendientes = [];

        invSearch.run().each((result) => {
            const id = result.getValue({ name: 'internalid' });
            const tranId = result.getValue({ name: 'tranid' }) || id;
            const enviado = result.getValue({ name: constantes.TRANSACTION_FIELDS.ENVIADO_SFTP });
            const isEnviado = enviado === true || enviado === 'T';

            ids.push(id);
            tranids.push(tranId);
            if (isEnviado) {
                idsEnviados.push(id);
            } else {
                idsPendientes.push(id);
            }
            return true;
        });

        return {
            total: ids.length,
            enviadas: idsEnviados.length,
            pendientes: idsPendientes.length,
            ids: ids,
            tranids: tranids,
            idsEnviados: idsEnviados,
            idsPendientes: idsPendientes
        };
    };

    /**
     * Busca facturas por fecha de transacción o lista de IDs, obteniendo cabecera y líneas de artículos
     * @param {Object} options
     * @param {string} [options.fecha] Fecha en formato NetSuite (ej. 24/11/2026)
     * @param {number|string} [options.customerId] ID del cliente final (ej. 3375)
     * @param {Array<string|number>} [options.ids] Lista opcional de internal IDs específicos
     * @returns {Array<Object>} Lista de facturas estructuradas con cabecera y líneas
     */
    const buscarFacturas = (options) => {
        const { fecha, customerId, ids } = options;
        log.audit('LibEnvio:buscarFacturas', `Búsqueda iniciada. Fecha: [${fecha}], Cliente: [${customerId || 'Todos'}], IDs: [${ids ? ids.join(',') : 'N/A'}]`);

        const filters = [
            ['type', 'anyof', 'CustInvc'],
            'AND',
            ['taxline', 'is', 'F'],
            'AND',
            ['cogs', 'is', 'F']
        ];

        if (ids && ids.length > 0) {
            filters.push('AND', ['internalid', 'anyof', ids]);
        } else if (fecha) {
            filters.push('AND', ['trandate', 'on', fecha]);
        }

        if (customerId) {
            filters.push('AND', ['entity', 'anyof', customerId]);
        }

        const columns = [
            search.createColumn({ name: 'internalid' }),
            search.createColumn({ name: 'tranid' }),
            search.createColumn({ name: 'trandate' }),
            search.createColumn({ name: 'entity' }),
            search.createColumn({ name: 'amount' }),
            search.createColumn({ name: 'mainline' }),
            search.createColumn({ name: 'line' }),
            search.createColumn({ name: 'item' }),
            search.createColumn({ name: 'quantity' }),
            search.createColumn({ name: 'rate' }),
            search.createColumn({ name: 'amount' }),
            search.createColumn({ name: 'memo' })
        ];

        const invSearch = search.create({
            type: search.Type.INVOICE,
            filters: filters,
            columns: columns
        });

        const facturasMap = new Map();
        const pagedData = invSearch.runPaged({ pageSize: 1000 });

        pagedData.pageRanges.forEach((pageRange) => {
            const page = pagedData.fetch({ index: pageRange.index });
            page.data.forEach((result) => {
                const id = result.getValue({ name: 'internalid' });
                const isMainline = result.getValue({ name: 'mainline' }) === 'T' || result.getValue({ name: 'mainline' }) === true;

                if (!facturasMap.has(id)) {
                    facturasMap.set(id, {
                        internalId: id,
                        tranId: result.getValue({ name: 'tranid' }) || '',
                        tranDate: result.getValue({ name: 'trandate' }) || '',
                        entityId: result.getValue({ name: 'entity' }),
                        entityName: result.getText({ name: 'entity' }) || '',
                        totalAmount: result.getValue({ name: 'amount' }) || '0.00',
                        memo: result.getValue({ name: 'memo' }) || '',
                        lines: []
                    });
                }

                const factura = facturasMap.get(id);

                const itemId = result.getValue({ name: 'item' });
                if (!isMainline && itemId) {
                    factura.lines.push({
                        lineNum: result.getValue({ name: 'line' }) || '',
                        itemId: itemId,
                        itemSku: result.getText({ name: 'item' }) || '',
                        quantity: result.getValue({ name: 'quantity' }) || '0',
                        unitPrice: result.getValue({ name: 'rate' }) || '0.00',
                        lineAmount: result.getValue({ name: 'amount' }) || '0.00'
                    });
                }
            });
        });

        const facturasList = Array.from(facturasMap.values());
        log.audit('LibEnvio:buscarFacturas', `Total facturas estructuradas encontradas: ${facturasList.length}`);
        return facturasList;
    };

    /**
     * Construye el nombre estándar del archivo CSV según la fecha
     * @param {Object} options
     * @param {string} options.fecha Fecha formateada
     * @param {string} [options.prefijo='FLANIGANS_INVOICES_'] Prefijo de archivo
     * @returns {string} Nombre del archivo CSV
     */
    const construirNombreArchivo = (options) => {
        const { fecha, prefijo = 'FLANIGANS_INVOICES_' } = options;
        const cleanDate = (fecha || '').replace(/[^0-9]/g, '');
        return `${prefijo}${cleanDate}.csv`;
    };

    /**
     * Genera el archivo CSV con registros Header (H) y Detail (D)
     * @param {Object} options
     * @param {Array<Object>} options.facturas
     * @param {string} options.nombreArchivo
     * @returns {file.File} Objeto File de NetSuite
     */
    const generarCsv = (options) => {
        const { facturas, nombreArchivo } = options;
        log.audit('LibEnvio:generarCsv', `Generando CSV (H/D) para ${facturas.length} facturas. Archivo: ${nombreArchivo}`);

        const rows = [];
        rows.push('RecordType,InvoiceNumber,Date,Customer,LineNum,ItemSKU,Quantity,UnitPrice,Amount');

        facturas.forEach((inv) => {
            // Registro H (Header)
            rows.push([
                'H',
                `"${inv.tranId}"`,
                `"${inv.tranDate}"`,
                `"${(inv.entityName || '').replace(/"/g, '""')}"`,
                '""',
                '""',
                '""',
                '""',
                `"${inv.totalAmount}"`
            ].join(','));

            // Registros D (Detail) para cada línea de artículo
            if (inv.lines && inv.lines.length > 0) {
                inv.lines.forEach((line) => {
                    rows.push([
                        'D',
                        `"${inv.tranId}"`,
                        `"${inv.tranDate}"`,
                        `"${(inv.entityName || '').replace(/"/g, '""')}"`,
                        `"${line.lineNum}"`,
                        `"${(line.itemSku || '').replace(/"/g, '""')}"`,
                        `"${line.quantity}"`,
                        `"${line.unitPrice}"`,
                        `"${line.lineAmount}"`
                    ].join(','));
                });
            }
        });

        const csvContent = rows.join('\r\n');

        const csvFile = file.create({
            name: nombreArchivo,
            fileType: file.Type.CSV,
            contents: csvContent,
            encoding: file.Encoding.UTF_8
        });

        return csvFile;
    };

    /**
     * Marca las facturas como enviadas por SFTP registrando la fecha, hora y archivo generado
     * @param {Object} options
     * @param {Array<string|number>} options.invoiceIds IDs internos de facturas
     * @param {number|string} [options.fileId] ID del archivo generado en File Cabinet
     * @returns {number} Cantidad de facturas actualizadas exitosamente
     */
    const marcarEnviadas = (options) => {
        const { invoiceIds, fileId } = options;
        if (!invoiceIds || invoiceIds.length === 0) return 0;

        log.audit('LibEnvio:marcarEnviadas', `Marcando ${invoiceIds.length} facturas como enviadas por SFTP (FileId: ${fileId || 'N/A'}).`);

        const fechaEnvio = new Date();
        let actualizadas = 0;

        invoiceIds.forEach((invId) => {
            try {
                const valuesToSubmit = {
                    [constantes.TRANSACTION_FIELDS.ENVIADO_SFTP]: true,
                    [constantes.TRANSACTION_FIELDS.FECHA_ENVIO_SFTP]: fechaEnvio
                };

                if (fileId) {
                    valuesToSubmit[constantes.TRANSACTION_FIELDS.ARCHIVO_SFTP] = fileId;
                }

                record.submitFields({
                    type: record.Type.INVOICE,
                    id: invId,
                    values: valuesToSubmit,
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });
                actualizadas++;
            } catch (err) {
                log.error('LibEnvio:marcarEnviadas:Error', `No se pudo marcar factura ID ${invId}: ${err.message}`);
            }

            const remUsage = runtime.getCurrentScript().getRemainingUsage();
            if (remUsage < 100) {
                log.audit('LibEnvio:marcarEnviadas', `Gobernanza baja (${remUsage} unidades restantes). Continuando.`);
            }
        });

        log.audit('LibEnvio:marcarEnviadas', `Actualización completada: ${actualizadas}/${invoiceIds.length} facturas marcadas.`);
        return actualizadas;
    };

    /**
     * Envía correo con resumen de ejecución del reproceso SFTP
     * @param {Object} options
     * @param {string} options.estado OK | ERROR | SIN_FACTURAS
     * @param {string} options.fecha Fecha reprocesada
     * @param {number} options.numFacturas Número de facturas
     * @param {string} options.nombreArchivo Nombre del archivo CSV
     * @param {string} options.modo Modo de transporte usado
     * @param {string} [options.detalleError] Mensaje de error si aplica
     * @param {string|Array<string>} [options.destinatarios] Lista de correos
     * @param {number|string} [options.autor] ID de usuario autor
     * @param {Array<Object>} [options.facturas] Lista estructurada de facturas para la tabla del correo
     * @param {file.File} [options.adjunto] Archivo generado para adjuntar al correo
     */
    const enviarResumen = (options) => {
        const {
            estado,
            fecha,
            numFacturas = 0,
            nombreArchivo = 'N/A',
            modo = 'SFTP',
            detalleError = '',
            destinatarios,
            autor,
            facturas = [],
            adjunto
        } = options;

        try {
            const authorId = autor || runtime.getCurrentUser().id || -5;
            let recipients = [];

            if (destinatarios) {
                if (Array.isArray(destinatarios)) {
                    recipients = destinatarios;
                } else if (typeof destinatarios === 'string') {
                    recipients = destinatarios.split(',').map(e => e.trim()).filter(e => e.length > 0);
                }
            }

            if (recipients.length === 0) {
                const userEmail = runtime.getCurrentUser().email;
                if (userEmail) {
                    recipients.push(userEmail);
                }
            }

            if (recipients.length === 0) {
                log.audit('LibEnvio:enviarResumen', 'No hay destinatarios configurados para el correo de resumen.');
                return;
            }

            const subject = `[Protano's Bakery] Resumen Reproceso SFTP Facturas - Estado: ${estado} (${fecha})`;

            let badgeColor = '#28a745';
            if (estado === 'ERROR') badgeColor = '#dc3545';
            if (estado === 'SIN_FACTURAS') badgeColor = '#ffc107';

            let facturasTableHtml = '';
            if (facturas && facturas.length > 0) {
                const rowsHtml = facturas.map(f => `
                    <tr>
                        <td style="padding: 6px 10px; border: 1px solid #dee2e6;">${f.tranId || f.internalId}</td>
                        <td style="padding: 6px 10px; border: 1px solid #dee2e6;">${f.tranDate || fecha}</td>
                        <td style="padding: 6px 10px; border: 1px solid #dee2e6; text-align: right;">${f.totalAmount || '0.00'}</td>
                    </tr>
                `).join('');

                facturasTableHtml = `
                    <h3 style="color: #333; margin-top: 20px; margin-bottom: 8px;">Facturas Incluidas (${facturas.length}):</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background-color: #f1f3f4;">
                                <th style="padding: 8px 10px; border: 1px solid #dee2e6; text-align: left;">Factura # (TranID)</th>
                                <th style="padding: 8px 10px; border: 1px solid #dee2e6; text-align: left;">Fecha</th>
                                <th style="padding: 8px 10px; border: 1px solid #dee2e6; text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                `;
            }

            const htmlBody = `
                <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; max-width: 650px; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px;">
                    <h2 style="color: #1a73e8; margin-top: 0;">Protano's Bakery · Reproceso SFTP</h2>
                    <p>Se ha completado la ejecución del reproceso de envío de facturas por SFTP.</p>
                    
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                        <tr style="background-color: #f8f9fa;">
                            <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Estado:</td>
                            <td style="padding: 10px; border: 1px solid #dee2e6;">
                                <span style="background-color: ${badgeColor}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${estado}</span>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Fecha Reprocesada:</td>
                            <td style="padding: 10px; border: 1px solid #dee2e6;">${fecha}</td>
                        </tr>
                        <tr style="background-color: #f8f9fa;">
                            <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Facturas Procesadas:</td>
                            <td style="padding: 10px; border: 1px solid #dee2e6;">${numFacturas}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Archivo CSV:</td>
                            <td style="padding: 10px; border: 1px solid #dee2e6;">${nombreArchivo}</td>
                        </tr>
                        <tr style="background-color: #f8f9fa;">
                            <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Modo de Envío:</td>
                            <td style="padding: 10px; border: 1px solid #dee2e6;">${modo}</td>
                        </tr>
                        ${detalleError ? `
                        <tr>
                            <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold; color: #dc3545;">Detalle / Error:</td>
                            <td style="padding: 10px; border: 1px solid #dee2e6; color: #dc3545;">${detalleError}</td>
                        </tr>` : ''}
                    </table>

                    ${facturasTableHtml}
                    
                    <p style="margin-top: 20px; font-size: 12px; color: #777;">
                        Mensaje generado automáticamente por la solución de integración SFTP desarrollada por <b>Efficientix</b>.
                        ${adjunto ? '<br><i>Se adjunta el archivo generado (.csv) a este correo.</i>' : ''}
                    </p>
                </div>
            `;

            const emailPayload = {
                author: authorId,
                recipients: recipients,
                subject: subject,
                body: htmlBody
            };

            if (adjunto) {
                emailPayload.attachments = [adjunto];
            }

            email.send(emailPayload);

            log.audit('LibEnvio:enviarResumen', `Correo de resumen enviado exitosamente a: ${recipients.join(', ')} (Adjunto: ${adjunto ? 'Sí' : 'No'})`);
        } catch (e) {
            log.error('LibEnvio:enviarResumen:Error', `No se pudo enviar correo de resumen: ${e.message}`);
        }
    };

    return {
        obtenerResumenFacturasFecha: obtenerResumenFacturasFecha,
        buscarFacturas: buscarFacturas,
        construirNombreArchivo: construirNombreArchivo,
        generarCsv: generarCsv,
        marcarEnviadas: marcarEnviadas,
        enviarResumen: enviarResumen
    };
});
