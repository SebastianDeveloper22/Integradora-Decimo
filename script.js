// --- CONFIGURACIÓN PRINCIPAL ---
const STRAPI_URL = "http://192.168.1.22:1337/api"; 

let ultimoRegistroID = 0; 
let usuarioActual = null; // Guardamos en memoria quién está usando el sistema

// --- REFERENCIAS AL DOM (HTML) ---
const screens = {
    login: document.getElementById('screen-login'),
    dashboard: document.getElementById('screen-dashboard')
};
// Contenedor donde se inyectarán los botones dinámicamente
const gridBotones = document.querySelector('.buttons-grid'); 

// Ocultamos la pantalla del cable USB porque ya somos 100% WiFi
const screenConnect = document.getElementById('screen-connect');
if(screenConnect) screenConnect.classList.add('hidden');
screens.login.classList.remove('hidden');


// ==========================================
// 1. RADAR DE ACCESOS (ESCUCHA AL ESP32 VÍA WIFI)
// ==========================================
setInterval(revisarNuevosAccesos, 2000);
console.log("Radar WiFi activado. Escuchando a Strapi en:", STRAPI_URL);

async function revisarNuevosAccesos() {
    try {
        // Pedimos el último registro creado
        const url = `${STRAPI_URL}/accesos?sort[0]=createdAt:desc&pagination[limit]=1`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.data && data.data.length > 0) {
            // Compatibilidad para Strapi v4 y v5
            const registro = data.data[0];
            const idActual = registro.id || registro.documentId;
            const atributos = registro.attributes || registro;
            const uidLeido = atributos.UID_Leido;

            if (ultimoRegistroID === 0) {
                ultimoRegistroID = idActual; // Sincronización inicial
            } else if (idActual !== ultimoRegistroID) {
                console.log("¡NUEVA TARJETA DETECTADA!", uidLeido);
                ultimoRegistroID = idActual;
                verificarUsuarioStrapi(uidLeido);
            }
        }
    } catch (error) {
        // Silenciado para no llenar la consola si hay un salto en la red
    }
}


// ==========================================
// 2. AUTENTICACIÓN DEL EMPLEADO
// ==========================================
async function verificarUsuarioStrapi(uid) {
    document.getElementById('loader').classList.remove('hidden');
    
    try {
        const url = `${STRAPI_URL}/empleados?filters[UID_Tarjeta][$eq]=${uid}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.data && data.data.length > 0) {
            let usuario = data.data[0].attributes || data.data[0];
            usuarioActual = usuario; // Lo guardamos en memoria
            
            // Antes de mostrar la pantalla, cargamos sus materiales
            await cargarInventario(usuario.Area);
            ingresarSistema(usuario);
        } else {
            alert("⛔ ACCESO DENEGADO: Tarjeta no registrada en el sistema.");
        }
    } catch (error) {
        console.error("Error validando usuario:", error);
    } finally {
        document.getElementById('loader').classList.add('hidden');
    }
}


// ==========================================
// 3. GENERADOR DINÁMICO DE INVENTARIO
// ==========================================
async function cargarInventario(areaUsuario) {
    try {
        let urlInventario = "";

        // Si es del Almacén, tiene acceso maestro a todos los bins.
        // Si es de otra área (Corte, Maquinado, Ensamble...), se filtra.
        if (areaUsuario === "Almacen") {
            urlInventario = `${STRAPI_URL}/inventarios`; 
        } else {
            urlInventario = `${STRAPI_URL}/inventarios?filters[Area_Permitida][$eq]=${areaUsuario}`;
        }

        const response = await fetch(urlInventario);
        const data = await response.json();
        const items = data.data || [];

        // Limpiar botones anteriores
        gridBotones.innerHTML = "";

        if (items.length === 0) {
            gridBotones.innerHTML = "<p>No hay componentes asignados a esta área.</p>";
            return;
        }

        // Crear los botones HTML automáticamente basándonos en Strapi
        items.forEach(item => {
            const atributos = item.attributes || item;
            
            // Creamos un elemento <button>
            const btn = document.createElement("button");
            btn.className = "btn-item";
            
            // Le ponemos texto y el código del Bin abajo
            btn.innerHTML = `📦 ${atributos.Nombre} <br><small>(${atributos.Codigo_Bin})</small>`;
            
            // Le asignamos la función de solicitar al hacer clic
            btn.onclick = () => solicitarItem(atributos.Codigo_Bin, atributos.Nombre);
            
            // Lo inyectamos en la pantalla
            gridBotones.appendChild(btn);
        });

    } catch (error) {
        console.error("Error cargando inventario:", error);
        gridBotones.innerHTML = "<p>Error al cargar la base de datos de componentes.</p>";
    }
}


// ==========================================
// 4. CONTROL DE INTERFAZ Y ROBOT
// ==========================================
function ingresarSistema(usuario) {
    document.getElementById('lbl-nombre').innerText = "Hola, " + usuario.Nombre;
    document.getElementById('lbl-area').innerText = "Área: " + usuario.Area;

    screens.login.classList.add('hidden');
    screens.dashboard.classList.remove('hidden');
}

function cerrarSesion() {
    usuarioActual = null;
    gridBotones.innerHTML = ""; // Borramos los botones por seguridad
    screens.dashboard.classList.add('hidden');
    screens.login.classList.remove('hidden');
}

async function solicitarItem(codigoBin, nombreItem) {
    const confirmacion = confirm(`¿Confirmar solicitud de: ${nombreItem} para el robot?`);
    if (!confirmacion) return;

    // TODO: En el siguiente paso configuraremos la tabla "Ordenes" en Strapi
    // para que la SKR sepa a qué coordenadas moverse.
    alert(`🤖 Orden registrada. El robot se dirige a buscar el ${codigoBin}...`);
    
    // Al pedir un ítem, cerramos sesión automáticamente por seguridad del kiosco
    setTimeout(cerrarSesion, 2000); 
}

async function pedirAyuda() {
    alert("🚨 ALERTA ENVIADA: Aaron y el equipo de Almacén han sido notificados para brindar asistencia en ventanilla.");
}

// ==========================================
// 5. CONTROL DEL SELECTOR DE TEMA (CLARO/OSCURO)
// ==========================================
const toggleSwitch = document.querySelector('#checkbox-theme');
const currentTheme = localStorage.getItem('theme');

// 1. Revisar si hay una preferencia guardada al cargar la página
if (currentTheme) {
    document.body.classList.add(currentTheme);
    // Si el tema guardado es "light-theme", encendemos el interruptor
    if (currentTheme === 'light-theme') {
        toggleSwitch.checked = true;
    }
}

// 2. Escuchar el cambio en el interruptor
toggleSwitch.addEventListener('change', function(e) {
    if (e.target.checked) {
        // Si se activa, aplicamos el tema claro
        document.body.classList.add('light-theme');
        localStorage.setItem('theme', 'light-theme');
    } else {
        // Si se desactiva, quitamos la clase (vuelve al oscuro por defecto)
        document.body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark-theme');
    }
});