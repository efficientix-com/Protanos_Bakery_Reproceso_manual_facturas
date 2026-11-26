/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Suitelet auxiliar para capturar y probar credenciales SFTP (Password GUID)
 * Desarrollado por Efficientix (EFX)
 */
define([
    'N/ui/serverWidget',
    'N/ui/message',
    'N/sftp',
    'N/file',
    'N/runtime',
    'N/log',
    './EFX_PB_Constantes_LIB'
], (
    serverWidget,
    message,
    sftp,
    file,
    runtime,
    log,
    constantes
) => {

    const onRequest = (context) => {
        const { request, response } = context;

        if (request.method === 'GET') {
            handleGet(request, response);
        } else if (request.method === 'POST') {
            handlePost(request, response);
        }
    };

    const handleGet = (request, response) => {
        const form = serverWidget.createForm({
            title: "Gestión de Credenciales SFTP - Protano's Bakery (EFX)"
        });

        const fg = form.addFieldGroup({
            id: 'custpage_fg_cred',
            label: 'Parámetros de Conexión SFTP'
        });

        // Valores por defecto
        const defaultHost = 'a1f51.us-west-1.sftpcloud.io';
        const defaultPort = 22;
        const defaultUser = '297f480baeaa4835bc64c624beb02265';
        const defaultDir = '/';
        const defaultHostKey = 'AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBELYopkHc6vi++AqprGSo00zclDui4Ywj08QrnZgkLOF9v8PX8nlNErFMpnq9XyDGhYTKcWK/NtmeHYJIeQ89XM=';
        const defaultHostKeyType = 'ecdsa';

        const urlField = form.addField({
            id: 'custpage_url',
            type: serverWidget.FieldType.TEXT,
            label: 'SFTP Host URL',
            container: 'custpage_fg_cred'
        });
        urlField.defaultValue = defaultHost;
        urlField.isMandatory = true;

        const portField = form.addField({
            id: 'custpage_port',
            type: serverWidget.FieldType.INTEGER,
            label: 'Puerto',
            container: 'custpage_fg_cred'
        });
        portField.defaultValue = defaultPort;
        portField.isMandatory = true;

        const userField = form.addField({
            id: 'custpage_user',
            type: serverWidget.FieldType.TEXT,
            label: 'Usuario',
            container: 'custpage_fg_cred'
        });
        userField.defaultValue = defaultUser;
        userField.isMandatory = true;

        const dirField = form.addField({
            id: 'custpage_dir',
            type: serverWidget.FieldType.TEXT,
            label: 'Directorio Remoto',
            container: 'custpage_fg_cred'
        });
        dirField.defaultValue = defaultDir;
        dirField.isMandatory = true;

        const hostKeyField = form.addField({
            id: 'custpage_hostkey',
            type: serverWidget.FieldType.LONGTEXT,
            label: 'SFTP Host Key (Base64)',
            container: 'custpage_fg_cred'
        });
        hostKeyField.defaultValue = defaultHostKey;

        const hostKeyTypeField = form.addField({
            id: 'custpage_hostkey_type',
            type: serverWidget.FieldType.TEXT,
            label: 'SFTP Host Key Type (ej: rsa, ecdsa, ed25519)',
            container: 'custpage_fg_cred'
        });
        hostKeyTypeField.defaultValue = defaultHostKeyType;

        // Campo seguro de credencial
        const pwdCredField = form.addCredentialField({
            id: 'custpage_sftp_pwd',
            label: 'Contraseña SFTP (Generará Password GUID)',
            restrictToScriptIds: [
                constantes.SCRIPTS.SCHEDULED.SCRIPT_ID,
                constantes.SCRIPTS.CREDENCIALES_SL.SCRIPT_ID
            ],
            restrictToDomains: [
                'demo.wftpserver.com',
                'a1f51.us-west-1.sftpcloud.io',
                'sftpcloud.io'
            ]
        });
        pwdCredField.maxLength = 64;

        form.addSubmitButton({
            label: 'Probar Conexión SFTP y Obtener GUID'
        });

        response.writePage(form);
    };

    const handlePost = (request, response) => {
        const url = (request.parameters.custpage_url || '').trim();
        const port = parseInt(request.parameters.custpage_port, 10) || 2222;
        const username = (request.parameters.custpage_user || '').trim();
        const directory = (request.parameters.custpage_dir || '').trim() || '/upload';
        const hostKey = (request.parameters.custpage_hostkey || '').trim();
        const hostKeyType = (request.parameters.custpage_hostkey_type || '').trim();
        const passwordGuid = request.parameters.custpage_sftp_pwd;

        const form = serverWidget.createForm({
            title: "Resultado de Conexión SFTP"
        });

        log.audit('CredencialesSL:handlePost', {
            url: url,
            port: port,
            username: username,
            directory: directory,
            hostKeyType: hostKeyType,
            hostKeyPreview: hostKey ? hostKey.substring(0, 30) + '...' : 'none',
            passwordGuid: passwordGuid ? 'RECIBIDO (' + passwordGuid + ')' : 'VACIO'
        });

        try {
            if (!passwordGuid) {
                throw new Error('No se recibió el Password GUID. Debe ingresar la contraseña.');
            }

            // Preparar opciones de conexión
            const connectionOptions = {
                url: url,
                port: port,
                username: username,
                passwordGuid: passwordGuid,
                directory: directory,
                hostKey: hostKey
            };

            if (hostKeyType) {
                connectionOptions.hostKeyType = hostKeyType;
            }

            log.audit('CredencialesSL:createConnection', 'Intentando sftp.createConnection con parámetros indicados...');
            let connection = null;

            try {
                connection = sftp.createConnection(connectionOptions);
                log.audit('CredencialesSL:createConnection', 'Conexión SFTP establecida exitosamente.');
            } catch (connErr) {
                log.error('CredencialesSL:createConnection:Error', {
                    error: connErr.message,
                    name: connErr.name,
                    stack: connErr.stack
                });

                // Si falló y tenemos clave RSA alternativa, intentar auto-fallback
                if (hostKeyType === 'ecdsa' && constantes.SFTP_DEFAULT.HOST_KEY_RSA) {
                    log.audit('CredencialesSL:Fallback', 'Probando fallback con algoritmo RSA...');
                    connectionOptions.hostKey = constantes.SFTP_DEFAULT.HOST_KEY_RSA;
                    connectionOptions.hostKeyType = 'rsa';
                    connection = sftp.createConnection(connectionOptions);
                    log.audit('CredencialesSL:Fallback', 'Fallback RSA exitoso.');
                } else {
                    throw connErr;
                }
            }

            form.addPageInitMessage({
                type: message.Type.CONFIRMATION,
                title: '¡Conexión SFTP Exitosa!',
                message: `Se conectó correctamente al servidor SFTP <b>${url}:${port}</b> con el usuario <b>${username}</b>.<br><br><b>Password GUID generado:</b> <br><code style="font-size:16px; font-weight:bold; background:#e8f4fd; padding:6px 10px; border:1px solid #bce8f1; border-radius:4px; display:inline-block; margin-top:5px;">${passwordGuid}</code><br><br>👉 <b>Siguiente paso:</b> Copia este GUID y pégalo en el parámetro <b>SFTP Password GUID</b> (<code>custscript_efx_pb_sftp_pwd_guid</code>) en el despliegue del Scheduled Script.`
            });

        } catch (e) {
            log.error('CredencialesSL:handlePost:ErrorFinal', {
                mensaje: e.message,
                name: e.name,
                stack: e.stack,
                guid: passwordGuid
            });
            form.addPageInitMessage({
                type: message.Type.ERROR,
                title: 'Error de Conexión SFTP',
                message: `<b>Detalle del error:</b> ${e.message}<br><br><b>GUID recibido:</b> ${passwordGuid || 'Ninguno'}<br><br>Verifique los logs de ejecución del Suitelet para más detalles.`
            });
        }

        form.addButton({
            id: 'custpage_btn_back',
            label: 'Volver',
            functionName: 'window.history.back();'
        });

        response.writePage(form);
    };

    return {
        onRequest: onRequest
    };
});
