/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Adaptador de transporte para envío de archivos (Modos: SIMULADO, SIMULADO_ERROR, SFTP)
 * Desarrollado por Efficientix (EFX)
 */
define(['N/sftp', 'N/file', 'N/search', 'N/record', 'N/log', './EFX_PB_Constantes_LIB'], 
(sftp, file, search, record, log, constantes) => {

    /**
     * Obtiene o crea la carpeta en File Cabinet para el modo SIMULADO
     * @param {string} folderName 
     * @returns {number|null} ID de la carpeta
     */
    const obtenerOCrearCarpetaSimulada = (folderName) => {
        try {
            const folderSearch = search.create({
                type: search.Type.FOLDER,
                filters: [['name', 'is', folderName]],
                columns: ['internalid']
            });
            const results = folderSearch.run().getRange({ start: 0, end: 1 });
            if (results && results.length > 0) {
                return results[0].getValue({ name: 'internalid' });
            }

            // Crear carpeta si no existe
            const folderRec = record.create({ type: record.Type.FOLDER });
            folderRec.setValue({ fieldId: 'name', value: folderName });
            return folderRec.save();
        } catch (e) {
            log.error('obtenerOCrearCarpetaSimulada', `Error al obtener/crear carpeta: ${e.message}`);
            return null;
        }
    };

    /**
     * Envía un archivo según la configuración y el modo seleccionado
     * @param {Object} options
     * @param {file.File} options.archivo Objeto archivo de NetSuite
     * @param {string} options.nombreArchivo Nombre destino del archivo
     * @param {string} options.modo SIMULADO | SIMULADO_ERROR | SFTP
     * @param {Object} [options.sftpConfig] Configuración para conexión SFTP real
     * @param {boolean} [options.replaceExisting=true] Sobrescribir archivo existente
     * @returns {Object} Resultado del transporte
     */
    const enviar = (options) => {
        const {
            archivo,
            nombreArchivo,
            modo = constantes.MODOS_TRANSPORTE.SFTP,
            sftpConfig = {},
            replaceExisting = true
        } = options;

        log.audit('Transporte:enviar', `Iniciando envío en modo [${modo}] para archivo: ${nombreArchivo}`);

        // 1. Guardar siempre respaldo en File Cabinet (Carpeta Protanos_Doc)
        const folderName = constantes.CARPETA_SIMULADA.DEFAULT_FOLDER_NAME;
        const folderId = obtenerOCrearCarpetaSimulada(folderName);
        let savedFileId = null;

        if (folderId) {
            archivo.name = nombreArchivo;
            archivo.folder = folderId;
            archivo.isOnline = true;
            savedFileId = archivo.save();
            log.audit('Transporte:enviar:FileCabinet', `Archivo guardado en File Cabinet (ID: ${savedFileId}, Carpeta: ${folderName})`);
        } else {
            log.error('Transporte:enviar:FileCabinet', `No se pudo obtener/crear carpeta destino: ${folderName}`);
        }

        if (modo === constantes.MODOS_TRANSPORTE.SIMULADO_ERROR) {
            throw new Error(`[SIMULADO_ERROR] Fallo provocado de conexión SFTP: Timeout o rechazo de credenciales para servidor demo.`);
        }

        if (modo === constantes.MODOS_TRANSPORTE.SIMULADO) {
            if (!savedFileId) {
                throw new Error(`No se pudo guardar el archivo en la carpeta de NetSuite: ${folderName}`);
            }
            return {
                exito: true,
                modo: constantes.MODOS_TRANSPORTE.SIMULADO,
                fileId: savedFileId,
                nombreArchivo: nombreArchivo,
                mensaje: `Archivo guardado en File Cabinet (Carpeta: ${folderName})`
            };
        }

        if (modo === constantes.MODOS_TRANSPORTE.SFTP) {
            const {
                url = constantes.SFTP_DEFAULT.URL,
                port = constantes.SFTP_DEFAULT.PORT,
                username = constantes.SFTP_DEFAULT.USER,
                passwordGuid,
                keyId,
                directory = constantes.SFTP_DEFAULT.DIR,
                hostKey = constantes.SFTP_DEFAULT.HOST_KEY,
                hostKeyType = constantes.SFTP_DEFAULT.HOST_KEY_TYPE
            } = sftpConfig;

            if (!url || !username) {
                throw new Error('Configuración SFTP incompleta: url y username son requeridos.');
            }

            if (!passwordGuid && !keyId) {
                log.audit('Transporte:enviar:SFTP_WARN', 'No se ha configurado Password GUID o SSH Key ID en el deployment del Scheduled Script.');
                return {
                    exito: true,
                    modo: constantes.MODOS_TRANSPORTE.SFTP,
                    fileId: savedFileId,
                    nombreArchivo: nombreArchivo,
                    mensaje: `Archivo generado y almacenado en ${folderName}. Para transmisión al SFTP real ${url}:${port}, configure el Password GUID en el deployment.`
                };
            }

            const effectiveHostKey = hostKey || constantes.SFTP_DEFAULT.HOST_KEY;
            const effectiveHostKeyType = hostKeyType || constantes.SFTP_DEFAULT.HOST_KEY_TYPE;

            const connectionOptions = {
                url: url,
                port: parseInt(port, 10),
                username: username,
                directory: directory,
                hostKey: effectiveHostKey
            };

            if (effectiveHostKeyType) {
                connectionOptions.hostKeyType = effectiveHostKeyType;
            }

            if (passwordGuid) {
                connectionOptions.passwordGuid = passwordGuid;
            } else if (keyId) {
                connectionOptions.keyId = keyId;
            }

            log.audit('Transporte:enviar:SFTP_Conectando', `Conectando a SFTP: ${url}:${port} - Directorio: ${directory} - Usuario: ${username} - HostKeyType: ${effectiveHostKeyType}`);
            
            let connection = null;
            try {
                connection = sftp.createConnection(connectionOptions);
                log.audit('Transporte:enviar:SFTP_ConexionExitosa', `✔ Conexión SFTP establecida exitosamente con ${url}:${port}`);
            } catch (errConn) {
                log.error('Transporte:enviar:SFTP_ErrorConexion', `Fallo primer intento de conexión con ${effectiveHostKeyType}: ${errConn.message}`);
                // Fallback automático si es ecdsa -> rsa o viceversa
                if (effectiveHostKeyType === 'ecdsa' && constantes.SFTP_DEFAULT.HOST_KEY_RSA) {
                    log.audit('Transporte:enviar:SFTP_Fallback', 'Intentando fallback a HostKey RSA...');
                    connectionOptions.hostKey = constantes.SFTP_DEFAULT.HOST_KEY_RSA;
                    connectionOptions.hostKeyType = 'rsa';
                    connection = sftp.createConnection(connectionOptions);
                    log.audit('Transporte:enviar:SFTP_ConexionExitosa', `✔ Conexión SFTP establecida exitosamente con HostKey RSA`);
                } else {
                    const errorConexion = new Error(`Error al conectar al servidor SFTP (${url}:${port}): ${errConn.message}`);
                    errorConexion.fileId = savedFileId;
                    throw errorConexion;
                }
            }

            log.audit('Transporte:enviar:SFTP_Subiendo', `Subiendo archivo a servidor SFTP [Directorio: ${directory}, Archivo: ${nombreArchivo}]...`);
            try {
                connection.upload({
                    file: archivo,
                    filename: nombreArchivo,
                    replaceExisting: replaceExisting
                });
                log.audit('Transporte:enviar:SFTP_UploadExitoso', `✔ Archivo ${nombreArchivo} subido exitosamente a ${url}:${port}${directory}`);
            } catch (eUpload) {
                log.error('Transporte:enviar:SFTP_UploadError', `Error al transferir archivo [${nombreArchivo}] a [${directory}]: ${eUpload.name} - ${eUpload.message}`);
                const errorUpload = new Error(`Conexión SFTP OK, pero el servidor rechazó la subida del archivo (${eUpload.message}). Es posible que el usuario demo carezca de permisos de escritura.`);
                errorUpload.fileId = savedFileId;
                errorUpload.originalError = eUpload;
                throw errorUpload;
            }

            return {
                exito: true,
                modo: constantes.MODOS_TRANSPORTE.SFTP,
                fileId: savedFileId,
                nombreArchivo: nombreArchivo,
                mensaje: `Archivo transmitido exitosamente por SFTP a ${url}:${port}${directory}`
            };
        }

        throw new Error(`Modo de transporte desconocido: ${modo}`);
    };

    return {
        enviar: enviar
    };
});
