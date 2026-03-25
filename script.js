// ==========================================
// DSI | SISTEMA AS/RS - Aplicación Principal
// ==========================================
(function () {
    "use strict";

    const STRAPI_URL = "http://192.168.1.32:1337/api";

    // --- Estado de la aplicación ---
    let usuarioActual = null;
    let alertaActivaID = null;
    let pollingEnCurso = false;
    let pollingIntervalID = null;
    let pollingRetrasos = 0; // Para backoff exponencial

    // --- Cache de elementos DOM ---
    const screens = {
        login: document.getElementById("screen-login"),
        dashboard: document.getElementById("screen-dashboard"),
    };
    const gridBotones = document.querySelector(".buttons-grid");
    const loader = document.getElementById("loader");
    const lblNombre = document.getElementById("lbl-nombre");
    const lblArea = document.getElementById("lbl-area");
    const txtModo = document.getElementById("txt-modo");
    const inputUser = document.getElementById("input-user");
    const inputPass = document.getElementById("input-pass");
    const btnLogin = document.getElementById("btn-login");
    const btnLogout = document.getElementById("btn-logout");
    const btnEmergency = document.getElementById("btn-emergency");
    const modalAyuda = document.getElementById("modal-ayuda");
    const txtProblema = document.getElementById("txt-problema");
    const alertaBloqueante = document.getElementById("alerta-bloqueante");
    const alertaQuien = document.getElementById("alerta-quien");
    const alertaMensaje = document.getElementById("alerta-mensaje");
    const checkboxTheme = document.getElementById("checkbox-theme");
    const formLogin = document.getElementById("form-login");
    const btnEnviarAlerta = document.getElementById("btn-enviar-alerta");
    const btnCancelarAyuda = document.getElementById("btn-cancelar-ayuda");
    const btnResolverAlerta = document.getElementById("btn-resolver-alerta");

    // ==========================================
    // UTILIDADES
    // ==========================================

    /** Extrae atributos de un item Strapi (compatible v3 y v4) */
    function getAttributes(item) {
        return item.attributes || item;
    }

    /** Wrapper para fetch que valida res.ok y parsea JSON */
    async function fetchJSON(url, options) {
        const res = await fetch(url, options);
        if (!res.ok) {
            throw new Error("Error HTTP " + res.status + ": " + res.statusText);
        }
        return res.json();
    }

    /** Crea un boton de inventario reutilizable usando textContent (sin innerHTML) */
    function crearBotonItem(attr, onClickHandler) {
        const btn = document.createElement("button");
        btn.className = "btn-item";

        const icono = document.createTextNode("📦 " + attr.Nombre + " ");
        const br = document.createElement("br");
        const small = document.createElement("small");
        small.textContent = "(" + attr.Codigo_Bin + ")";

        btn.appendChild(icono);
        btn.appendChild(br);
        btn.appendChild(small);
        btn.addEventListener("click", onClickHandler);
        return btn;
    }

    /** Muestra un mensaje de error visible al usuario dentro del grid */
    function mostrarErrorEnGrid(mensaje) {
        gridBotones.innerHTML = "";
        const p = document.createElement("p");
        p.className = "accent-text";
        p.textContent = mensaje;
        gridBotones.appendChild(p);
    }

    // ==========================================
    // 1. DETECCIÓN DE ENTORNO (LOCAL VS REMOTO)
    // ==========================================
    const esKioscoLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

    if (esKioscoLocal) {
        txtModo.textContent = "Servidor Almacén (Escuchando Alertas)";
        iniciarPollingAlertas();
    } else {
        txtModo.textContent = "Terminal Remota";
    }

    // ==========================================
    // 2. AUTENTICACIÓN
    // ==========================================
    async function iniciarSesionManual(event) {
        if (event) event.preventDefault();

        const user = inputUser.value.trim();
        const pass = inputPass.value.trim();

        if (!user || !pass) {
            alert("Ingrese usuario y contraseña.");
            return;
        }

        // Deshabilitar boton durante la petición para evitar doble envío
        btnLogin.disabled = true;
        btnLogin.textContent = "Ingresando...";
        loader.classList.remove("hidden");

        try {
            const url =
                STRAPI_URL +
                "/empleados?filters[Usuario][$eq]=" +
                encodeURIComponent(user);

            const data = await fetchJSON(url);

            if (!data.data || data.data.length === 0) {
                alert("⛔ USUARIO NO ENCONTRADO.");
                return;
            }

            const empleado = getAttributes(data.data[0]);

            if (empleado.Contrasena !== pass) {
                alert("⛔ CONTRASEÑA INCORRECTA.");
                return;
            }

            // Login exitoso — limpiar campos y guardar sesión
            inputUser.value = "";
            inputPass.value = "";
            usuarioActual = empleado;
            sessionStorage.setItem("sesion", JSON.stringify(empleado));

            await cargarInventario(empleado.Area);

            lblNombre.textContent = "Hola, " + empleado.Nombre;
            lblArea.textContent =
                "Área: " +
                (empleado.Area === "Almacen"
                    ? "Almacén (Superusuario)"
                    : empleado.Area);

            screens.login.classList.add("hidden");
            screens.dashboard.classList.remove("hidden");
        } catch (error) {
            console.error("Error en login:", error);
            alert("Error de conexión con el servidor: " + error.message);
        } finally {
            loader.classList.add("hidden");
            btnLogin.disabled = false;
            btnLogin.textContent = "Ingresar";
        }
    }

    function cerrarSesion() {
        if (!confirm("¿Desea cerrar sesión?")) return;
        usuarioActual = null;
        gridBotones.innerHTML = "";
        sessionStorage.removeItem("sesion");
        screens.dashboard.classList.add("hidden");
        screens.login.classList.remove("hidden");
    }

    /** Restaura la sesión desde sessionStorage al recargar la página */
    function restaurarSesion() {
        const datos = sessionStorage.getItem("sesion");
        if (!datos) return;
        try {
            const empleado = JSON.parse(datos);
            usuarioActual = empleado;
            lblNombre.textContent = "Hola, " + empleado.Nombre;
            lblArea.textContent =
                "Área: " +
                (empleado.Area === "Almacen"
                    ? "Almacén (Superusuario)"
                    : empleado.Area);
            cargarInventario(empleado.Area);
            screens.login.classList.add("hidden");
            screens.dashboard.classList.remove("hidden");
        } catch (e) {
            sessionStorage.removeItem("sesion");
        }
    }

    // ==========================================
    // 3. CARGAR INVENTARIO Y ORDENAR
    // ==========================================
    async function cargarInventario(areaUsuario) {
        try {
            const urlInventario =
                areaUsuario === "Almacen"
                    ? STRAPI_URL + "/inventarios?pagination[pageSize]=100"
                    : STRAPI_URL +
                      "/inventarios?filters[Area_Permitida][$eq]=" +
                      encodeURIComponent(areaUsuario) +
                      "&pagination[pageSize]=100";

            const data = await fetchJSON(urlInventario);
            const items = data.data || [];
            gridBotones.innerHTML = "";

            if (items.length === 0) {
                mostrarErrorEnGrid("No hay componentes asignados a esta área.");
                return;
            }

            items.forEach(function (item) {
                const attr = getAttributes(item);
                const btn = crearBotonItem(attr, function () {
                    solicitarItem(attr.Codigo_Bin, attr.Nombre);
                });
                gridBotones.appendChild(btn);
            });
        } catch (error) {
            console.error("Error cargando inventario:", error);
            mostrarErrorEnGrid(
                "Error al cargar inventario. Verifique la conexión."
            );
        }
    }

    async function solicitarItem(codigoBin, nombreItem) {
        if (!confirm("¿Confirmar solicitud de: " + nombreItem + "?")) return;

        try {
            const resBin = await fetchJSON(
                STRAPI_URL +
                    "/bins?filters[Codigo_Bin][$eq]=" +
                    encodeURIComponent(codigoBin)
            );

            if (!resBin.data || resBin.data.length === 0) {
                alert(
                    "Error: No se encontraron coordenadas para el bin " +
                        codigoBin
                );
                return;
            }

            const coord = getAttributes(resBin.data[0]);

            const nuevaOrden = {
                data: {
                    Bin_Solicitado: codigoBin,
                    Estado: "Pendiente",
                    Usuario_Solicitante: usuarioActual.Nombre,
                    X: coord.Coord_X,
                    Y: coord.Coord_Y,
                    Z: coord.Coord_Z,
                },
            };

            await fetchJSON(STRAPI_URL + "/ordenes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(nuevaOrden),
            });

            alert(
                "🤖 Orden enviada. El robot CNC irá a X:" +
                    coord.Coord_X +
                    ", Z:" +
                    coord.Coord_Z +
                    " y extraerá en Y:" +
                    coord.Coord_Y
            );

            setTimeout(function () {
                usuarioActual = null;
                gridBotones.innerHTML = "";
                sessionStorage.removeItem("sesion");
                screens.dashboard.classList.add("hidden");
                screens.login.classList.remove("hidden");
            }, 2000);
        } catch (error) {
            console.error("Error procesando orden:", error);
            alert("Error al enviar la orden: " + error.message);
        }
    }

    // ==========================================
    // 4. SISTEMA ANDON (ASISTENCIA TÉCNICA)
    // ==========================================
    function abrirModalAyuda() {
        modalAyuda.classList.remove("hidden");
        txtProblema.value = "";
        txtProblema.focus();
    }

    function cerrarModalAyuda() {
        modalAyuda.classList.add("hidden");
    }

    async function enviarAlerta() {
        const problema = txtProblema.value.trim();
        if (!problema) {
            alert("Por favor, describa el problema.");
            return;
        }
        if (!usuarioActual) {
            alert("Error: No hay sesión activa.");
            return;
        }

        const paqueteAlerta = {
            data: {
                Usuario: usuarioActual.Nombre,
                Area: usuarioActual.Area,
                Mensaje: problema,
                Estado: "Pendiente",
            },
        };

        try {
            await fetchJSON(STRAPI_URL + "/alertas", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(paqueteAlerta),
            });
            cerrarModalAyuda();
            alert(
                "🚨 Alerta enviada exitosamente. El equipo de Almacén ha sido bloqueado y notificado."
            );
        } catch (error) {
            console.error("Error al enviar alerta:", error);
            alert("Error al enviar alerta: " + error.message);
        }
    }

    // ==========================================
    // POLLING DE ALERTAS ANDON (solo en kiosco)
    // ==========================================
    function iniciarPollingAlertas() {
        pollingRetrasos = 0;
        programarSiguientePoll();

        // Pausar el polling cuando el tab no es visible
        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                if (pollingIntervalID) {
                    clearTimeout(pollingIntervalID);
                    pollingIntervalID = null;
                }
            } else {
                // Al volver al tab, retomar inmediatamente
                pollingRetrasos = 0;
                revisarAlertasAndon();
                programarSiguientePoll();
            }
        });
    }

    function programarSiguientePoll() {
        if (pollingIntervalID) clearTimeout(pollingIntervalID);
        // Backoff exponencial: 3s base, duplica en cada error, max 30s
        var intervalo = Math.min(3000 * Math.pow(2, pollingRetrasos), 30000);
        pollingIntervalID = setTimeout(function () {
            revisarAlertasAndon().then(programarSiguientePoll);
        }, intervalo);
    }

    async function revisarAlertasAndon() {
        if (pollingEnCurso) return; // Evitar peticiones solapadas
        pollingEnCurso = true;
        try {
            const url =
                STRAPI_URL +
                "/alertas?filters[Estado][$eq]=Pendiente&pagination[limit]=1";
            const data = await fetchJSON(url);

            pollingRetrasos = 0; // Reset backoff al tener éxito

            if (data.data && data.data.length > 0) {
                const alerta = data.data[0];
                alertaActivaID = alerta.id || alerta.documentId;
                const attr = getAttributes(alerta);

                alertaQuien.textContent =
                    "El usuario " +
                    attr.Usuario +
                    " (Área: " +
                    attr.Area +
                    ") requiere asistencia.";
                alertaMensaje.textContent = attr.Mensaje;
                alertaBloqueante.classList.remove("hidden");
            }
        } catch (error) {
            console.warn("Error en polling de alertas:", error.message);
            pollingRetrasos = Math.min(pollingRetrasos + 1, 4);
        } finally {
            pollingEnCurso = false;
        }
    }

    async function resolverAlerta() {
        if (!alertaActivaID) return;
        try {
            await fetchJSON(STRAPI_URL + "/alertas/" + alertaActivaID, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: { Estado: "Atendida" } }),
            });
            alertaBloqueante.classList.add("hidden");
            alertaActivaID = null;
        } catch (error) {
            console.error("Error al resolver alerta:", error);
            alert("Error al cerrar la alerta: " + error.message);
        }
    }

    // ==========================================
    // 5. TEMA (DARK / LIGHT)
    // ==========================================
    if (checkboxTheme) {
        var currentTheme = localStorage.getItem("theme");
        if (currentTheme) {
            document.body.classList.add(currentTheme);
            if (currentTheme === "light-theme") checkboxTheme.checked = true;
        }
        checkboxTheme.addEventListener("change", function (e) {
            document.body.classList.toggle("light-theme", e.target.checked);
            localStorage.setItem(
                "theme",
                e.target.checked ? "light-theme" : "dark-theme"
            );
        });
    }

    // ==========================================
    // 6. MODO DEMO OFFLINE (Ctrl+Q)
    // ==========================================
    function activarModoDemo() {
        console.log("⚠️ MODO DEMO OFFLINE ACTIVADO");
        loader.classList.remove("hidden");

        setTimeout(function () {
            gridBotones.innerHTML = "";
            var inventarioFalso = [
                { Nombre: "Tornillos M4", Codigo_Bin: "BIN_A1" },
                { Nombre: "Motor NEMA 17", Codigo_Bin: "BIN_B2" },
                { Nombre: "Sensor Inductivo", Codigo_Bin: "BIN_C3" },
                { Nombre: "Rodamiento 608zz", Codigo_Bin: "BIN_D4" },
            ];

            inventarioFalso.forEach(function (attr) {
                var btn = crearBotonItem(attr, function () {
                    if (confirm("¿Solicitar " + attr.Nombre + "?")) {
                        alert(
                            "🤖 (DEMO) Orden simulada. El robot iría a buscar el " +
                                attr.Codigo_Bin +
                                "."
                        );
                        setTimeout(function () {
                            usuarioActual = null;
                            gridBotones.innerHTML = "";
                            screens.dashboard.classList.add("hidden");
                            screens.login.classList.remove("hidden");
                        }, 2000);
                    }
                });
                gridBotones.appendChild(btn);
            });

            var usuarioDemo = { Nombre: "Aaron (Demo)", Area: "Almacen" };
            usuarioActual = usuarioDemo;

            lblNombre.textContent = "Hola, " + usuarioDemo.Nombre;
            lblArea.textContent = "Área: Almacén (Superusuario)";

            screens.login.classList.add("hidden");
            screens.dashboard.classList.remove("hidden");
            loader.classList.add("hidden");
        }, 800);
    }

    document.addEventListener("keydown", function (e) {
        if (e.ctrlKey && (e.key === "q" || e.key === "Q")) {
            e.preventDefault();
            activarModoDemo();
        }
    });

    // ==========================================
    // 7. REGISTRO DE EVENT LISTENERS
    // ==========================================
    if (formLogin) formLogin.addEventListener("submit", iniciarSesionManual);
    if (btnLogout) btnLogout.addEventListener("click", cerrarSesion);
    if (btnEmergency) btnEmergency.addEventListener("click", abrirModalAyuda);
    if (btnEnviarAlerta) btnEnviarAlerta.addEventListener("click", enviarAlerta);
    if (btnCancelarAyuda) btnCancelarAyuda.addEventListener("click", cerrarModalAyuda);
    if (btnResolverAlerta) btnResolverAlerta.addEventListener("click", resolverAlerta);

    // Cerrar modal de ayuda con Escape
    modalAyuda.addEventListener("keydown", function (e) {
        if (e.key === "Escape") cerrarModalAyuda();
    });

    // ==========================================
    // 8. INICIALIZACIÓN
    // ==========================================
    restaurarSesion();
})();
