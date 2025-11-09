const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Permite todas las origins
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Endpoint de salud
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Copetran Proxy API está funcionando' });
});

// Endpoint principal para rastrear guías
app.post('/api/rastrear-guia', async (req, res) => {
  try {
    const { numeroGuia } = req.body;

    if (!numeroGuia) {
      return res.status(400).json({ 
        error: 'Número de guía es requerido' 
      });
    }

    console.log(`🔍 Consultando guía: ${numeroGuia}`);

    // Paso 1: Obtener la página inicial para establecer sesión
    const sessionResponse = await axios.get(
      'https://autogestion.copetran.com.co/gestion_2/Forms/trakingRemesas.php',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
        }
      }
    );

    // Extraer cookies de la sesión
    const cookies = sessionResponse.headers['set-cookie'];
    const cookieString = cookies ? cookies.join('; ') : '';

    console.log('✅ Sesión establecida');

    // Paso 2: Hacer la consulta de la guía
    const formData = new URLSearchParams({
      'PR00': numeroGuia,
      'Archivo': 'Remesas',
      'Clase': 'Remesas',
      'Funcion': 'trakingRemesas',
      'PR20': '',
      'PR01': 'true',
      'Boton': 'Boton'
    });

    const response = await axios.post(
      'https://autogestion.copetran.com.co/gestion_2/controller/controlador.php',
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieString,
          'Referer': 'https://autogestion.copetran.com.co/gestion_2/Forms/trakingRemesas.php',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
        },
        timeout: 15000
      }
    );

    console.log('✅ Respuesta recibida de Copetran');

    // Log adicional para depuración
    const htmlContent = response.data || '';
    console.log(`🔎 HTML length: ${htmlContent.length}`);

    // Detectar mensajes típicos de "sin resultados" en la página respuesta
    const lowerHtml = htmlContent.toLowerCase();
    const noResultPhrases = [
      'no se encontraron',
      'no se encontraron remesas',
      'no existe remesa',
      'la remesa consultada no existe',
      'remesa consultada no existe',
      'la remesa consultada',
      'no se encontro',
      'no hay registros',
      'sin resultados',
    ];

    const hasNoResults = noResultPhrases.some((p) => lowerHtml.includes(p));

    if (hasNoResults) {
      console.log('⚠️ Copetran devolvió página sin resultados para la guía');
      // Devolver un JSON con éxito=false y un fragmento del HTML para inspección
      return res.status(404).json({
        success: false,
        error: 'No se encontraron datos para esta guía',
        numeroGuia: numeroGuia,
        htmlSnippet: htmlContent.slice(0, 2000),
      });
    }

    // Retornar el HTML completo para que el cliente lo parsee
    res.json({
      success: true,
      html: htmlContent,
      numeroGuia: numeroGuia
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ 
        error: 'Tiempo de espera agotado al consultar Copetran' 
      });
    }

    if (error.response) {
      return res.status(error.response.status).json({ 
        error: `Error del servidor de Copetran: ${error.response.status}` 
      });
    }

    res.status(500).json({ 
      error: 'Error al consultar la guía',
      details: error.message 
    });
  }
});

// Endpoint GET alternativo
app.get('/api/rastrear-guia/:numeroGuia', async (req, res) => {
  const { numeroGuia } = req.params;
  
  // Redirigir al POST
  return await app._router.handle(
    { ...req, method: 'POST', body: { numeroGuia } },
    res
  );
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   🚚 Copetran Proxy API Server                ║
║   ✅ Servidor corriendo en puerto ${PORT}        ║
║   📡 Endpoints disponibles:                   ║
║      - GET  /health                           ║
║      - POST /api/rastrear-guia                ║
║      - GET  /api/rastrear-guia/:numero        ║
╚═══════════════════════════════════════════════╝
  `);
});