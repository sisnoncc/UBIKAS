let botonSeleccionadoId = null;
let modoEdicionActual = "completo"; 
let map = null;
let marker = null;
let geocoderControl = null;
let coordenadaTemporal = null;
let sortableInstance = null;
let estaArrastrando = false;
let deferredPrompt = null;
let usuarioIdActual = null;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrado con éxito', reg))
            .catch(err => console.log('Error al registrar el Service Worker', err));
    });
}

function obtenerDispositivo() {
    const ua = navigator.userAgent;
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return "movil";
    return "pc";
}

function inicializarAppSupabase(userId) {
    usuarioIdActual = userId;
    
    const infoDispositivo = document.getElementById("info-dispositivo");
    if (infoDispositivo) {
        infoDispositivo.innerText = "Dispositivo: " + obtenerDispositivo().toUpperCase();
    }
    
    procesarEnlaceCompartidoExterno();
    renderizarBotones();
    configurarInstalacionPWA();
}

async function obtenerTotalBotonesDB() {
    let { count, error } = await db
        .from('botones_ubicaciones')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', usuarioIdActual);

    if (error) return 1;
    return (count || 0) + 1;
}

async function procesarEnlaceCompartidoExterno() {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text');

    if (sharedUrl && usuarioIdActual) {
        let dispositivo = obtenerDispositivo();
        let total = await obtenerTotalBotonesDB();

        await db.from('botones_ubicaciones').insert([{
            user_id: usuarioIdActual,
            orden: total,
            nombre: "Ubicación compartida",
            ubicacion_nav: sharedUrl,
            ubicacion_local: sharedUrl
        }]);

        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function configurarInstalacionPWA() {
    const btnInstalar = document.getElementById('btn-instalar-app');

    if (btnInstalar) {
        btnInstalar.style.display = 'none';
    }

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        if (btnInstalar) btnInstalar.style.display = 'none';
        return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (btnInstalar) btnInstalar.style.display = 'block';
    });

    if (btnInstalar) {
        btnInstalar.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    console.log('Usuario aceptó instalar la app');
                }
                deferredPrompt = null;
                btnInstalar.style.display = 'none';
            } else {
                alert("Para instalar la app, toca los tres puntos (⋮) en la esquina superior derecha de tu navegador y selecciona 'Añadir a la pantalla de inicio'.");
            }
        });
    }
}

async function renderizarBotones() {
    const contenedor = document.getElementById("contenedor-botones");
    if (!contenedor || !usuarioIdActual) return;
    contenedor.innerHTML = "";
    let dispositivo = obtenerDispositivo();

    let { data: botones, error } = await db
        .from('botones_ubicaciones')
        .select('*')
        .eq('user_id', usuarioIdActual)
        .order('orden', { ascending: true });

    if (error) {
        console.error("Error al cargar botones:", error);
        botones = []; // Evita que rompa si hay un error de red o tabla vacía
    }

    // Nos aseguramos de que sea un array válido
    let listaBotones = botones || [];
    let totalVisual = listaBotones.length + 1;

    for (let i = 0; i < listaBotones.length; i++) {
        let btnData = listaBotones[i];
        let idReal = btnData.id;
        let textoEtiqueta = btnData.nombre || "Nuevo";
        let enlaceNav = btnData.ubicacion_nav;
        let enlaceLocal = dispositivo === "movil" ? btnData.ubicacion_local : btnData.ubicacion_nav;
        let estaConfigurado = (enlaceNav || enlaceLocal);

        let grupo = document.createElement("div");
        grupo.className = "item-group";
        grupo.setAttribute("data-id", idReal);

        let btn = document.createElement("button");
        btn.innerHTML = estaConfigurado ? "📍" : "+";
        if (estaConfigurado) btn.style.backgroundColor = "#28a745";
        
        btn.onclick = function() {
            if (estaArrastrando) return;

            if (estaConfigurado) {
                let enlace = enlaceNav || enlaceLocal;
                if (enlace) window.open(enlace, "_blank");
            } else {
                abrirModalConfiguracion(idReal, "completo");
            }
        };

        let pressTimer = null;
        let iniciarPresion = function() {
            if (!estaConfigurado || estaArrastrando) return; 
            
            pressTimer = setTimeout(function() {
                if (!estaArrastrando) {
                    abrirModalOpciones(idReal, textoEtiqueta);
                }
            }, 800);
        };

        let cancelarPresion = function() {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        btn.addEventListener('mousedown', iniciarPresion);
        btn.addEventListener('touchstart', iniciarPresion, {passive: true});
        btn.addEventListener('mouseup', cancelarPresion);
        btn.addEventListener('mouseleave', cancelarPresion);
        btn.addEventListener('touchend', cancelarPresion);
        btn.addEventListener('touchmove', cancelarPresion);

        let p = document.createElement("p");
        p.className = "label-text";
        p.innerText = textoEtiqueta;
        p.title = textoEtiqueta;

        grupo.appendChild(btn);
        grupo.appendChild(p);
        contenedor.appendChild(grupo);
    }

    // Botón fantasma final para añadir nuevo (Siempre se dibuja)
    let grupoVacio = document.createElement("div");
    grupoVacio.className = "item-group no-sort";
    grupoVacio.setAttribute("data-fixed", "true");

    let btnVacio = document.createElement("button");
    btnVacio.innerHTML = "+";
    btnVacio.onclick = async function() {
        if (estaArrastrando) return;
        let { data, error } = await db.from('botones_ubicaciones').insert([{
            user_id: usuarioIdActual,
            orden: totalVisual,
            nombre: ""
        }]).select();

        if (!error && data) {
            abrirModalConfiguracion(data[0].id, "completo");
        } else {
            console.error("Error al crear nuevo botón:", error);
        }
    };

    let pVacio = document.createElement("p");
    pVacio.className = "label-text";
    pVacio.innerText = "Nuevo";

    grupoVacio.appendChild(btnVacio);
    grupoVacio.appendChild(pVacio);
    contenedor.appendChild(grupoVacio);

    inicializarSortable();
}

function inicializarSortable() {
    const contenedor = document.getElementById("contenedor-botones");
    if (sortableInstance) {
        sortableInstance.destroy();
    }

    sortableInstance = Sortable.create(contenedor, {
        animation: 150,
        filter: ".no-sort",
        preventOnFilter: false,
        onStart: function(evt) {
            estaArrastrando = true;
        },
        onEnd: function(evt) {
            setTimeout(() => {
                estaArrastrando = false;
            }, 100);
            guardarNuevoOrden();
        },
        onCancel: function(evt) {
            estaArrastrando = false;
        }
    });
}

async function guardarNuevoOrden() {
    const contenedor = document.getElementById("contenedor-botones");
    const grupos = contenedor.getElementsByClassName("item-group");

    let promesas = [];
    let ordenContador = 1;

    for (let g of grupos) {
        let idBtn = g.getAttribute("data-id");
        if (idBtn && g.getAttribute("data-fixed") !== "true") {
            promesas.push(
                db.from('botones_ubicaciones')
                  .update({ orden: ordenContador })
                  .eq('id', idBtn)
            );
            ordenContador++;
        }
    }

    await Promise.all(promesas);
    renderizarBotones();
}

function abrirModalOpciones(id, nombre) {
    if (estaArrastrando) return;
    botonSeleccionadoId = id;
    document.getElementById("titulo-opciones-btn").innerText = "Botón: " + nombre;
    document.getElementById("modal-opciones").style.display = "flex";
}

function cerrarModalOpciones() {
    document.getElementById("modal-opciones").style.display = "none";
}

function ejecutarModificarUbicacion() {
    cerrarModalOpciones();
    abrirMapaInteractivo("");
}

function ejecutarModificarTexto() {
    cerrarModalOpciones();
    abrirModalConfiguracion(botonSeleccionadoId, "solo-texto");
}

async function ejecutarEliminar() {
    let id = botonSeleccionadoId;
    cerrarModalOpciones();

    if (confirm("¿Estás seguro de que deseas eliminar este botón?")) {
        await db.from('botones_ubicaciones').delete().eq('id', id);
        renderizarBotones();
    }
}

async function abrirModalConfiguracion(id, modo) {
    botonSeleccionadoId = id;
    modoEdicionActual = modo;

    let inputNombre = document.getElementById("input-nombre-btn");
    let inputDirAprox = document.getElementById("input-dir-aprox");
    let inputLinkMaps = document.getElementById("input-link-gmaps");
    let contenedorExtra = document.getElementById("contenedor-campos-extra");
    let tituloModal = document.getElementById("titulo-modal-config");

    let { data } = await db.from('botones_ubicaciones').select('nombre').eq('id', id).single();

    inputNombre.value = data ? (data.nombre || "") : "";
    inputDirAprox.value = "";
    inputLinkMaps.value = "";
    inputNombre.classList.remove("input-error");

    if (modo === "solo-texto") {
        tituloModal.innerText = "Modificar Nombre";
        contenedorExtra.style.display = "none";
    } else {
        tituloModal.innerText = "Configurar Botón";
        contenedorExtra.style.display = "block";
    }

    document.getElementById("modal-nombre").style.display = "flex";
    inputNombre.focus();
}

function cerrarModalConfig() {
    document.getElementById("modal-nombre").style.display = "none";
}

function limpiarError(elemento) {
    elemento.classList.remove("input-error");
}

async function procesarConfiguracion() {
    let inputNombre = document.getElementById("input-nombre-btn");
    let nombre = inputNombre.value.trim();

    if (!nombre) {
        inputNombre.classList.add("input-error");
        return;
    }

    let id = botonSeleccionadoId;
    await db.from('botones_ubicaciones').update({ nombre: nombre }).eq('id', id);
    cerrarModalConfig();

    if (modoEdicionActual === "solo-texto") {
        renderizarBotones();
        return;
    }

    let inputLinkMaps = document.getElementById("input-link-gmaps");
    let inputDirAprox = document.getElementById("input-dir-aprox");
    let linkMaps = inputLinkMaps.value.trim();
    let dirAprox = inputDirAprox.value.trim();

    if (linkMaps !== "") {
        await db.from('botones_ubicaciones').update({ 
            ubicacion_nav: linkMaps,
            ubicacion_local: linkMaps 
        }).eq('id', id);

        renderizarBotones();
        return;
    }

    abrirMapaInteractivo(dirAprox);
}

function abrirMapaInteractivo(direccionInicial = "") {
    document.getElementById("contenedor-mapa-modal").style.display = "flex";

    setTimeout(() => {
        if (!map) {
            map = L.map('map', { tap: false }).setView([40.4168, -3.7038], 6);
            
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles © Esri'
            }).addTo(map);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd'
            }).addTo(map);

            geocoderControl = L.Control.geocoder({
                defaultMarkGeocode: false,
                placeholder: "Buscar dirección...",
                collapsed: false,
                geocoder: L.Control.Geocoder.nominatim()
            }).on('markgeocode', function(e) {
                let center = e.geocode.center;
                map.setView(center, 16);
                colocarChinchetaProvisional(center);
            }).addTo(map);

            let GeoControl = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: function () {
                    let container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
                    let link = L.DomUtil.create('a', 'btn-geolocalizacion', container);
                    link.href = '#';
                    link.innerHTML = '◎';
                    link.title = 'Usar mi ubicación GPS actual';
                    
                    L.DomEvent.on(link, 'click', function(e) {
                        L.DomEvent.stopPropagation(e);
                        L.DomEvent.preventDefault(e);
                        
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(function(position) {
                                let latLng = [position.coords.latitude, position.coords.longitude];
                                map.setView(latLng, 17);
                                colocarChinchetaProvisional({lat: latLng[0], lng: latLng[1]});
                            }, function(error) {
                                alert("No se pudo obtener la ubicación GPS.");
                            }, {enableHighAccuracy: true, timeout: 10000});
                        } else {
                            alert("Geolocalización no soportada.");
                        }
                    });
                    return container;
                }
            });
            map.addControl(new GeoControl());

            let mapElement = document.getElementById('map');
            mapElement.addEventListener('contextmenu', function(e) { e.preventDefault(); });

            map.on('click', function(e) {
                colocarChinchetaProvisional(e.latlng);
            });

        } else {
            map.invalidateSize();
        }

        if (direccionInicial && direccionInicial !== "") {
            let inputGeocodificador = document.querySelector('.leaflet-control-geocoder-form input');
            if (inputGeocodificador) {
                inputGeocodificador.value = direccionInicial;
                geocoderControl.geocode(direccionInicial);
            }
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(position) {
                map.setView([position.coords.latitude, position.coords.longitude], 15);
            }, function() {});
        }
    }, 300);
}

function colocarChinchetaProvisional(latlng) {
    coordenadaTemporal = latlng;

    let pinIcon = L.divIcon({
        className: 'custom-pin',
        html: '<div id="elemento-chincheta" style="font-size: 34px; text-align: center; cursor: pointer; transform: scale(1.1); transition: transform 0.2s;">📌</div>',
        iconSize: [35, 35],
        iconAnchor: [17, 35]
    });

    if (marker) map.removeLayer(marker);
    marker = L.marker([latlng.lat, latlng.lng], {icon: pinIcon}).addTo(map);

    setTimeout(() => {
        let pinElement = document.getElementById("elemento-chincheta");
        if (pinElement) {
            let pressTimerModal = null;
            let accionEjecutada = false;

            let abrirModalConfirmacion = function(e) {
                if (e) e.stopPropagation();
                if (accionEjecutada) return;
                accionEjecutada = true;
                document.getElementById("modal-confirmar-pin").style.display = "flex";
            };

            let iniciarAviso = function(e) {
                accionEjecutada = false;
                pressTimerModal = setTimeout(function() {
                    abrirModalConfirmacion(e);
                }, 800);
            };

            let cancelarAviso = function(e) {
                if (pressTimerModal) {
                    clearTimeout(pressTimerModal);
                    pressTimerModal = null;
                }
            };

            let manejarClickDirecto = function(e) {
                if (pressTimerModal) {
                    clearTimeout(pressTimerModal);
                    pressTimerModal = null;
                }
                abrirModalConfirmacion(e);
            };

            pinElement.addEventListener('click', manejarClickDirecto);
            pinElement.addEventListener('mousedown', iniciarAviso);
            pinElement.addEventListener('touchstart', iniciarAviso, {passive: true});
            pinElement.addEventListener('mouseup', cancelarAviso);
            pinElement.addEventListener('mouseleave', cancelarAviso);
            pinElement.addEventListener('touchend', cancelarAviso);
            pinElement.addEventListener('touchmove', cancelarAviso);
        }
    }, 100);
}

async function guardarUbicacionDefinitiva() {
    if (!coordenadaTemporal) return;

    let lat = coordenadaTemporal.lat;
    let lng = coordenadaTemporal.lng;
    let id = botonSeleccionadoId;
    let urlMaps = `https://maps.google.com/?q=${lat},${lng}`;

    await db.from('botones_ubicaciones').update({ 
        ubicacion_nav: urlMaps,
        ubicacion_local: urlMaps 
    }).eq('id', id);

    document.getElementById("modal-confirmar-pin").style.display = "none";
    document.getElementById("contenedor-mapa-modal").style.display = "none";
    
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }
    coordenadaTemporal = null;

    renderizarBotones();
}

function cerrarModalConfirmarPin() {
    document.getElementById("modal-confirmar-pin").style.display = "none";
}

function cerrarMapa() {
    document.getElementById("contenedor-mapa-modal").style.display = "none";
    document.getElementById("modal-confirmar-pin").style.display = "none";
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }
    coordenadaTemporal = null;
}
