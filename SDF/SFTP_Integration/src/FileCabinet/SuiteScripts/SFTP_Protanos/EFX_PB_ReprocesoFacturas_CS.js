/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Client Script para la interfaz del Suitelet de Reproceso SFTP (Protano's Bakery)
 * Desarrollado por Efficientix (EFX)
 */
define(['N/ui/dialog', 'N/currentRecord'], 
(dialog, currentRecord) => {

    /**
     * Función llamada al cargar la página
     * @param {Object} scriptContext
     */
    const pageInit = (scriptContext) => {
        // Inicialización
    };

    /**
     * Valida campos obligatorios y previene doble clic
     * @param {Object} scriptContext
     * @returns {boolean}
     */
    const saveRecord = (scriptContext) => {
        const rec = scriptContext.currentRecord;
        const fecha = rec.getValue({ fieldId: 'custpage_fecha' });
        const cliente = rec.getValue({ fieldId: 'custpage_cliente' });

        if (!fecha) {
            dialog.alert({
                title: 'Campo Requerido',
                message: 'Por favor seleccione una fecha válida para reprocesar el envío de facturas.'
            });
            return false;
        }

        if (!cliente) {
            dialog.alert({
                title: 'Campo Requerido',
                message: 'Por favor seleccione el Cliente Final.'
            });
            return false;
        }

        const btnSubmit = document.getElementById('submitter');
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.value = 'Procesando y encolando envío...';
        }

        return true;
    };

    /**
     * Recarga el Suitelet para refrescar la bitácora
     */
    const recargarPantalla = () => {
        const urlSinParametros = window.location.href.split('?')[0];
        const scriptDeployMatch = window.location.href.match(/script=[^&]+&deploy=[^&]+/);
        if (scriptDeployMatch) {
            window.location.href = `${urlSinParametros}?${scriptDeployMatch[0]}`;
        } else {
            window.location.reload();
        }
    };

    return {
        pageInit: pageInit,
        saveRecord: saveRecord,
        recargarPantalla: recargarPantalla
    };
});
