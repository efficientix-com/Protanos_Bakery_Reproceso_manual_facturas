/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Constantes generales para el proyecto de Reproceso SFTP - Protano's Bakery
 * Desarrollado por Efficientix (EFX)
 */
define([], () => {
    return {
        CONFIG_DEFAULT: {
            CLIENTE_DEFAULT: '3375'
        },
        RECORDS: {
            LOG: {
                ID: 'customrecord_efx_pb_sftp_log',
                FIELDS: {
                    FECHA_SOLICITADA: 'custrecord_efx_pb_log_fecha_solicitada',
                    CLIENTE: 'custrecord_efx_pb_log_cliente',
                    USUARIO: 'custrecord_efx_pb_log_usuario',
                    INICIO: 'custrecord_efx_pb_log_inicio',
                    FIN: 'custrecord_efx_pb_log_fin',
                    TASK_ID: 'custrecord_efx_pb_log_task_id',
                    ESTADO: 'custrecord_efx_pb_log_estado',
                    NUM_FACTURAS: 'custrecord_efx_pb_log_num_facturas',
                    IDS_PROCESADOS: 'custrecord_efx_pb_log_ids_procesados',
                    NOMBRE_ARCHIVO: 'custrecord_efx_pb_log_nombre_archivo',
                    ARCHIVO: 'custrecord_efx_pb_log_archivo',
                    MODO: 'custrecord_efx_pb_log_modo',
                    DETALLE_ERROR: 'custrecord_efx_pb_log_detalle_error'
                }
            }
        },
        TRANSACTION_FIELDS: {
            ENVIADO_SFTP: 'custbody_efx_pb_enviado_sftp',
            FECHA_ENVIO_SFTP: 'custbody_efx_pb_fecha_envio_sftp',
            ARCHIVO_SFTP: 'custbody_efx_pb_archivo_sftp'
        },
        LISTS: {
            ESTADO_ENVIO: {
                ID: 'customlist_efx_pb_estado_envio',
                VALORES: {
                    PENDIENTE: '1',
                    EN_PROCESO: '2',
                    OK: '3',
                    SIN_FACTURAS: '4',
                    ERROR: '5'
                },
                NOMBRES: {
                    '1': 'Pendiente',
                    '2': 'En proceso',
                    '3': 'OK',
                    '4': 'Sin facturas',
                    '5': 'Error'
                }
            }
        },
        MODOS_TRANSPORTE: {
            SIMULADO: 'SIMULADO',
            SIMULADO_ERROR: 'SIMULADO_ERROR',
            SFTP: 'SFTP'
        },
        SCRIPTS: {
            SUITELET: {
                SCRIPT_ID: 'customscript_efx_pb_reproceso_sl',
                DEPLOY_ID: 'customdeploy_efx_pb_reproceso_sl'
            },
            CLIENT_SCRIPT: {
                SCRIPT_ID: 'customscript_efx_pb_reproceso_cs'
            },
            CREDENCIALES_SL: {
                SCRIPT_ID: 'customscript_efx_pb_credenciales_sl',
                DEPLOY_ID: 'customdeploy_efx_pb_credenciales_sl'
            },
            SCHEDULED: {
                SCRIPT_ID: 'customscript_efx_pb_reproceso_ss',
                DEPLOY_ID: 'customdeploy_efx_pb_reproceso_ss',
                DEPLOY_DIARIO_ID: 'customdeploy_efx_pb_envio_diario_ss',
                PARAMS: {
                    FECHA: 'custscript_efx_pb_fecha',
                    LOG_ID: 'custscript_efx_pb_log_id',
                    MODO: 'custscript_efx_pb_modo',
                    CUSTOMER_ID: 'custscript_efx_pb_customer_id',
                    SFTP_HOST: 'custscript_efx_pb_sftp_host',
                    SFTP_PORT: 'custscript_efx_pb_sftp_port',
                    SFTP_USER: 'custscript_efx_pb_sftp_user',
                    SFTP_DIR: 'custscript_efx_pb_sftp_dir',
                    SFTP_PWD_GUID: 'custscript_efx_pb_sftp_pwd_guid',
                    SFTP_KEY_ID: 'custscript_efx_pb_sftp_key_id',
                    SFTP_HOSTKEY: 'custscript_efx_pb_sftp_hostkey',
                    SFTP_HOSTKEY_TYPE: 'custscript_efx_pb_sftp_hostkey_type',
                    IDS: 'custscript_efx_pb_ids',
                    CORREOS: 'custscript_efx_pb_correos'
                }
            }
        },
        CARPETA_SIMULADA: {
            DEFAULT_FOLDER_NAME: 'Protanos_Doc'
        },
        SFTP_DEFAULT: {
            URL: 'a1f51.us-west-1.sftpcloud.io',
            PORT: 22,
            USER: '297f480baeaa4835bc64c624beb02265',
            DIR: '/',
            HOST_KEY_ECDSA: 'AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBELYopkHc6vi++AqprGSo00zclDui4Ywj08QrnZgkLOF9v8PX8nlNErFMpnq9XyDGhYTKcWK/NtmeHYJIeQ89XM=',
            HOST_KEY_RSA: 'AAAAB3NzaC1yc2EAAAADAQABAAACAQCuO4OvG1431Eu8kaLmjlo7EY7bqcbhWH659oad5mIaXmcn+zEOLWW9jhVZ9TFFhRwKIfILZEVxaafTgApTRggRphfmqDN6qSYPfEVl49EUgTY1A8Crzf6A8LqgFu9Z6k/PL2yRsof4yfK/cmVfrUvlXBuLrm5Ilv2rtwnLHn84UIfFMc3Omu8pW0UghOOMg615KrgOcjb9tIQsXdhccXriTdToabE7CSP3XMB6FMGPnrJKx2L5PMEaY78Y8HN3ijy5RavRP5jUkhEsUw/+5jR83J7xYYATger0x+Vr2Fm/ji3LDN9nYSNKK37qWtvgK/dwMSEA5TerbdEjKFe+c/4wahlHMWny9bcLqMNM7fbHe6PCOUSI0RtDyBst+pzf8aBBtaKfqYA0NphL7OwCpLznwqF+fMuPz7Dhk6YrnaksdmVCAzX8HPpK3sbVy2AilvxmAxVjjkc+Vg+liPsmZw9H6S7LUMx7XY7Kl891zO8mhd1X6ryUxz7NN1hJK41IMDIih196/LpDwq5O4CmL8DdZ3whkGUJrgcMxcqjg7Nt8vuIf3QM5gmXN2cm8OL9OoRNPHCtWoawa6BDeek/vXDzD1bzDzXtvG/c7o5Xz8CcKYf1QmfAgZKGqWeYw4KOBuD2haKj+T55nQO+U9tl4bdSKhCLUvPmBjPfxFBVwQz7kKQ==',
            HOST_KEY: 'AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBELYopkHc6vi++AqprGSo00zclDui4Ywj08QrnZgkLOF9v8PX8nlNErFMpnq9XyDGhYTKcWK/NtmeHYJIeQ89XM=',
            HOST_KEY_TYPE: 'ecdsa'
        }
    };
});
