import { DocumentoBloqueTipo } from "@/lib/enums/consentimiento/documento-bloque-tipo";
import type { DocumentoApartado } from "@/lib/types/aceptacion-terminos.types";

export const DATOS_PERSONALES_VERSION = "2026-11-03";
export const DATOS_PERSONALES_CONTENIDO: readonly DocumentoApartado[] = [
  {
    titulo: "POLÍTICA DE PRIVACIDAD PARA EL USO DE LA PLATAFORMA “MINSA DIGITAL”",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "La presente Política de Privacidad tiene como objetivo informar al titular del dato personal (usuario de salud) registrado en la plataforma “MINSA DIGITAL”, del Ministerio de Salud, para agendar citas médicas presenciales o virtuales en establecimientos de salud del Ministerio de Salud en el cual se atiende y cuente con el Sistema de Historia Clínica Electrónica del MINSA.",
      },
    ],
  },
  {
    titulo: "BANCO DE DATOS",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "El titular del banco de datos personales es el Ministerio de Salud con domicilio legal en la Av. Salaverry N° 801, distrito de Jesús María, provincia y departamento de Lima.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Los datos personales serán almacenados en el banco de datos personales de titularidad del MINSA e inscrito en el Registro Nacional de Protección de Datos Personales con código:",
      },
      { tipo: DocumentoBloqueTipo.LISTA, items: [{ texto: "“Usuarios de plataforma MINSA DIGITAL”: Cód. de BDP N° EP-2026-49" }] },
    ],
  },
  {
    titulo: "FINALIDAD",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Gestionar la información de los usuarios de salud para el acceso a los servicios digitales de salud del Ministerio de Salud, tales como la reserva de citas médicas, visualización del historial de atenciones, consulta de estado de referencias, consulta de Carnet de vacunación y consulta desde recetas médicas desde “MINSA DIGITAL”, contribuyendo a mejorar la oportunidad y continuidad de la atención en salud.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Los datos personales podrán ser utilizados con fines históricos, además con fines estadísticos, de manera anonimizada (sin identificar al paciente), para mejorar la toma de decisiones en salud pública.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Adicionalmente, mediante SALUDBOT, el bot que se pone a disposición mediante un servicio de API de nube a través de WhatsApp de la empresa Meta Platforms, Inc., se facilitará exclusivamente:",
      },
      {
        tipo: DocumentoBloqueTipo.LISTA,
        items: [{ texto: "Reserva de citas médicas; y" }, { texto: "Consulta del estado de referencias." }],
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Para ambos servicios en SALUDBOT, se valida la identidad del usuario mediante su número de documento de identidad y fecha de emisión, contrastando dicha información con el registro de usuarios de MINSA DIGITAL. Si el usuario se encuentra registrado, podrá continuar con el servicio solicitado.",
      },
    ],
  },
  {
    titulo: "USUARIOS",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.LISTA,
        items: [
          {
            texto:
              "Personas que acceden a la plataforma MINSA DIGITAL, quienes aceptan el tratamiento de sus datos personales conforme a la presente Política de Privacidad",
          },
        ],
      },
    ],
  },
  {
    titulo: "DATOS PERSONALES",
    bloques: [
      { tipo: DocumentoBloqueTipo.SUBTITULO, texto: "INFORMACIÓN QUE SE RECOGERÁN" },
      {
        tipo: DocumentoBloqueTipo.LISTA,
        items: [
          {
            texto:
              "Datos de identificación: nombres y apellidos, tipo y número de documento de identidad, fecha de emisión de DNI, fecha de nacimiento y sexo.",
          },
          { texto: "Datos de contacto: número de teléfono y correo electrónico." },
          { texto: "Seguro de salud" },
          { texto: "En caso de paciente menor de edad:", subitems: ["Parentesco o relación con el representante o tutor legal"] },
          {
            texto:
              "Información relacionada con la atención en salud: registro de citas médicas, especialidad, establecimiento de salud, referencias médicas e historial de atenciones, medicamentos prescritos, indicaciones y dispensación.",
          },
          { texto: "Datos técnicos básicos del uso de la aplicación (registros de acceso y dispositivo)." },
        ],
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "La información recopilada es la necesaria para permitir el acceso a los servicios digitales de salud y se encuentra vinculada a los sistemas institucionales del Ministerio de Salud.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Para el uso de SALUDBOT: número de teléfono asociado a la cuenta de WhatsApp, número de DNI y fecha de emisión proporcionados por el usuario (solo para validación de identidad), así como la información necesaria para gestionar la reserva de cita o devolver el estado de la referencia consultada. La consulta del estado de una referencia puede revelar información relacionada con la salud y, por tanto, constituir información sensible.",
      },
    ],
  },
  {
    titulo: "DESTINATARIOS",
    bloques: [
      { tipo: DocumentoBloqueTipo.PARRAFO, texto: "Los destinatarios son:" },
      {
        tipo: DocumentoBloqueTipo.LISTA,
        items: [
          {
            texto:
              "Establecimientos de salud públicos de las Gerencias Regionales de Salud, Direcciones Regionales de Salud y Direcciones de Redes Integradas de Salud. El acceso es mediante personal autorizado responsable de la gestión de citas médicas, referencias y atención sanitaria del usuario.",
          },
          {
            texto:
              "Ministerio de Salud, porque la información de la plataforma MINSA DIGITAL se almacenará en los servidores o en infraestructura tecnológica contratada conforme a ley generándose un banco de datos personales.",
          },
          {
            texto:
              "Para la prestación SALUDBOT, interviene como proveedor de la infraestructura de mensajería y puede procesar los datos necesarios para transmitir los mensajes. También podrán intervenir proveedores tecnológicos que presten servicios de alojamiento, integración, soporte o mantenimiento, bajo las condiciones y autorizaciones que correspondan conforme a la normativa de protección de datos personales.",
          },
        ],
      },
    ],
  },
  {
    titulo: "ENLACES EXTERNOS",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Con la finalidad de facilitar al usuario la ubicación de los establecimientos de salud en opciones como “Consulta tu Estado de Referencia”, “Detalle de la Cita” y otros esta aplicación informática, puede incorporar enlaces al servicio Google Maps. La incorporación de estos enlaces tiene únicamente una finalidad de facilitar la ubicación, y no implica que el MINSA controle, administre o sea responsable del tratamiento de datos personales que Google pudiera realizar a través de sus propios servicios.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Si el usuario selecciona dichos enlaces o accesos será dirigido al servicio proporcionado por Google, pudiendo producirse el tratamiento de información conforme a las condiciones de políticas de privacidad aplicables a dicho servicio. Por lo que se recomienda al usuario revisar dicho documento antes de utilizar el servicio: https://support.google.com/maps/answer/10077010?hl=es&ref_topic=6384263&sjid=10632724575961469424-SA (el enlace puede variar por Google).",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Para el uso de SALUDBOT, el usuario interactúa a través de la plataforma de mensajería de Meta. El tratamiento que Meta realice en el marco de sus propios servicios se rige además por las condiciones y políticas de privacidad aplicables de dicha plataforma. El usuario puede consultar la información de privacidad y seguridad de WhatsApp en: https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security/. https://www.facebook.com/legal/WhatsApp-Business-Platform-Cloud-API",
      },
    ],
  },
  {
    titulo: "SERVICIOS MEDIANTE SALUDBOT",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "SALUDBOT, es un chatbot que utiliza una aplicación de software automatizada que realiza tareas sin intervención humana. Permite realizar la reserva de citas médicas y la consulta del estado de referencias.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "SALUDBOT, no sustituye los demás canales de atención del Ministerio de Salud. La información que se proporcione a través del chat se utilizará para validar el registro y atender el servicio solicitado.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "El usuario debe evitar incluir en el chat información adicional o datos personales de terceros que no sean necesarios para dicha finalidad.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "La información intercambiada en el entorno del servicio administrado por la entidad se conservará hasta por una (1) hora, conforme a lo informado para la implementación en https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security/",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Sin perjuicio de ello, la documentación técnica publicada por Meta para Cloud API señala que los mensajes pueden permanecer en su infraestructura hasta por treinta (30) días para determinadas funcionalidades del servicio. Por ello, el plazo de una hora no representa necesariamente el plazo total de conservación en las infraestructuras de los proveedores que intervienen.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "La utilización de WhatsApp implica además el tratamiento de información conforme a las condiciones y políticas aplicables de Meta y de WhatsApp. Se recomienda al usuario revisar las condiciones de privacidad de dichos servicios",
      },
    ],
  },
  {
    titulo: "FACULTADES DE ACCESO",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto: "Los usuarios acceden a su información a la plataforma MINSA DIGITAL, para lo cual deben consignar su usuario y clave.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Los usuarios acceden a SALUDBOT previa verificación de su identidad con su número de documento de identidad, fecha de emisión del documento de identidad y código enviado al correo registrado en la plataforma MINSA DIGITAL.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "La validación permite determinar si el usuario se encuentra registrado y habilitado para continuar con la reserva de cita médica o la consulta del estado de referencia.",
      },
    ],
  },
  {
    titulo: "CONSECUENCIAS DE PROPORCIONAR LOS DATOS PERSONALES O SU NEGATIVA A HACERLO",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "El usuario que proporcione sus datos personales en la plataforma MINSA DIGITAL podrá acceder a los servicios digitales de salud, tales como la reserva de citas médicas, consulta de referencias, visualización de su historial de atenciones y recetas médicas prescritas, facilitando una gestión más ágil y oportuna de su atención en el establecimiento de salud correspondiente.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto: "Asimismo, el uso de la aplicación permite reducir desplazamientos innecesarios y mejorar la continuidad de la atención.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "En el caso SALUDBOT, proporcionar el DNI y la fecha de emisión permite validar el registro en MINSA DIGITAL y, si la validación es satisfactoria, acceder a la reserva de citas médicas o consulta del estado de referencias a través de dicho canal.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "El usuario que no proporcione sus datos personales solicitados en el registro, no podrá acceder a las funcionalidades de la plataforma MINSA DIGITAL o utilizar las funciones aquí mencionadas de SALUDBOT. Sin embargo, ello no implica la eliminación ni restricción de su derecho a recibir atención médica presencial en el establecimiento de salud que lo atiende u otros canales institucionales disponibles, conforme a la normativa vigente.",
      },
    ],
  },
  {
    titulo: "TRANSFERENCIA NACIONAL",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Establecimientos de salud públicos de las Gerencias Regionales de Salud, Direcciones Regionales de Salud y Direcciones de Redes Integradas de Salud, a los cuales solicite la prestación de un servicio de salud mediante la plataforma MINSA DIGITAL.",
      },
    ],
  },
  {
    titulo: "FLUJO TRANSFRONTERIZO",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "El uso de SALUDBOT p implicar que los datos personales sean procesados o almacenados fuera del Perú por Meta Platforms, Inc. y/o por proveedores tecnológicos de este que intervengan en la prestación del servicio. La información comunicada por Meta identifica a Estados Unidos como ubicación de infraestructura de Meta; sin embargo, la ubicación efectiva y los países involucrados pueden depender de la infraestructura y condiciones aplicables al servicio. El flujo se realizará bajo las garantías exigidas por la normativa peruana de protección de datos personales. Para mayor, información consultar en: https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security/",
      },
    ],
  },
  {
    titulo: "OBLIGACIONES DE LOS USUARIOS",
    bloques: [
      { tipo: DocumentoBloqueTipo.PARRAFO, texto: "Las obligaciones de los usuarios son:" },
      {
        tipo: DocumentoBloqueTipo.LISTA,
        items: [
          { texto: "Actualizar periódicamente su clave para el acceso de la plataforma MINSA DIGITAL." },
          { texto: "Hacer uso correcto de las credenciales de acceso a la plataforma MINSA DIGITAL y SALUDBOT." },
          { texto: "Mantener la confidencialidad de las credenciales y no compartir el usuario y la clave de acceso con ninguna persona." },
          {
            texto: "No realizar acciones que intenten vulnerar los mecanismos de autenticación o controles de seguridad de la información.",
          },
          {
            texto:
              "Consignar información veraz y de cual tenga facultades legales para brindar los datos personales que registre en el sistema. Bajo responsabilidad civil, penal y administrativa que corresponda.",
          },
          {
            texto:
              "En caso de registrar datos personales de menor de edad dependientes, declara que Ud. ejerce la patria potestad o tutela, según corresponda.",
          },
        ],
      },
    ],
  },
  {
    titulo: "TIEMPO DE CONSERVACIÓN",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto: "El tiempo de conservación de la información registrada en la plataforma MINSA DIGITAL, se realiza de la siguiente manera:",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "La información relacionada con la programación de citas médicas, referencias e historial de atenciones será almacenada hasta por un plazo de 20 años posteriores desde su última atención y mientras sea necesaria para la prestación de los servicios digitales de salud, conforme a los plazos establecidos en la normativa vigente sobre gestión documental e historias clínicas del Ministerio de Salud.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "La información intercambiada en el chat de SALUDBOT se conservará hasta por una (01) hora en el entorno del servicio administrado por la entidad, según lo informado para su implementación. No obstante, Meta señala en su documentación técnica de Cloud API (https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security/) que los mensajes pueden permanecer en su infraestructura hasta por treinta (30) días para determinadas funcionalidades. Por tanto, el plazo de una hora no equivale necesariamente al plazo total de conservación de la información en todos los sistemas de los proveedores que intervienen.",
      },
      { tipo: DocumentoBloqueTipo.PARRAFO, texto: "Posterior a ello, solo se registrará para fines históricos y estadísticos." },
    ],
  },
  {
    titulo: "CONFIDENCIALIDAD DE LA INFORMACIÓN",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "El Ministerio de Salud tratará la información proporcionada voluntariamente de manera confidencial, teniendo en cuenta siempre las garantías y medidas de seguridad de la información que reconoce la Ley N.° 29733, Ley de Protección de Datos Personales, y su reglamento.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "El personal autorizado del Ministerio de Salud y de los establecimientos de salud públicos que tenga acceso a la información tienen la obligación de la guarda de confidencialidad de la información que tengan acceso, la cual perdurará incluso luego del término contractual o laboral con su establecimiento de salud; además de su deber de secreto profesional y cumplir con las medidas de seguridad de la información estipuladas por el Ministerio de salud y su establecimiento de salud en el manejo de bancos de datos personales. El personal de la salud se compromete a no revelar a terceros y a no usar en su provecho, ningún tipo de información que haya accedido a través de la plataforma MINSA DIGITAL.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "En caso el usuario crea o intuya que alguien haya accedido a su cuenta con su contraseña o intuya que su contraseña haya sido conocido por un tercero, solicitar cambio de su contraseña mediante el establecimiento de salud que le asignó credencial para acceso a la plataforma MINSA DIGITAL.",
      },
    ],
  },
  {
    titulo: "DERECHOS DE LOS USUARIOS",
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Los usuarios pueden ejercer sus derechos de Acceso, Rectificación, Cancelación y Oposición (ARCO), su derecho de impedir el suministro de los datos personales, su derecho al tratamiento o de tratamiento objetivo de los datos personales de sus hijos o tutelados, en los términos recogidos en la legislación peruana vigente, a través de la Ley 29733, Ley de Protección de Datos Personales y su modificatoria.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Se entiende que los derechos de Acceso, Rectificación, Cancelación y Oposición, el derecho de impedir el suministro de los datos personales, el derecho al tratamiento o de tratamiento objetivo de los datos están referidos a:",
      },
      {
        tipo: DocumentoBloqueTipo.LISTA,
        items: [
          {
            texto:
              "Acceso: el derecho del usuario a saber qué datos personales suyos se tienen, preguntar cómo los obtuvieron, para qué los utilizaron, con quién los han compartido y todos los detalles de su uso.",
          },
          {
            texto:
              "Rectificación: el derecho a modificar y actualizar los datos personales del usuario, cuando estos sean erróneos, inexactos o incompletos.",
          },
          {
            texto:
              "Cancelación: el derecho a cancelar el uso de los datos personales del usuario cuando la finalidad para la que los entregaste ha concluido, venció el plazo establecido para su tratamiento, o revocaste el consentimiento.",
          },
          {
            texto:
              "Oposición: el derecho a oponerse al uso de los datos del usuario porque están generando un perjuicio en diversos ámbitos, situación que se presenta con mayor frecuencia en plataformas digitales.",
          },
          {
            texto:
              "Impedir el suministro: Es el derecho de impedir que los datos del usuario sean entregados cuando esto afecte sus derechos fundamentales. El derecho a impedir la entrega no aplica para la relación entre el titular del banco de datos personales y el encargado de tratamiento de datos personales para los efectos del tratamiento de estos",
          },
          {
            texto:
              "Tratamiento o de tratamiento objetivo de los datos: Es el derecho que tiene el usuario a no verse sometido a una decisión con efectos jurídicos sobre si o que afecte de manera significativa, sustentada únicamente en un tratamiento de datos personales destinado a evaluar determinados aspectos de su personalidad o conducta, salvo que ello ocurra en el marco de la negociación, celebración o ejecución de un contrato o en los casos de evaluación con fines de incorporación a una entidad pública, de acuerdo a ley, sin perjuicio de la posibilidad de defender tu punto de vista, para salvaguardar tu legítimo interés.",
          },
        ],
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "En cualquier momento el USUARIO podrá revocar su consentimiento para el tratamiento de sus datos personales. Para lo cual, el Ministerio de Salud aplicará las reglas de cancelación o supresión de datos personales, según corresponda.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "Para poder ejercer estos derechos, el usuario puede realizar una solicitud al correo electrónico lpdp@minsa.gob.pe, detallando los motivos de su solicitud.",
      },
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "De considerar que no han atendido el ejercicio de sus derechos, puede presentar una reclamación ante la Autoridad Nacional de Protección de Datos Personales mediante la mesa de partes del Ministerio de Justicia y Derechos Humanos, ubicada en la calle Scipión Llona N° 350, Miraflores, o a través de su Formulario de la Mesa de partes virtual (MPV): https://sgd.minjus.gob.pe/sgd-virtual/public/ciudadano/ciudadanoMain.xhtml",
      },
    ],
  },
  {
    bloques: [
      {
        tipo: DocumentoBloqueTipo.PARRAFO,
        texto:
          "El usuario al uso de la plataforma “MINSA DIGITAL”, declara no sólo haber leído todas las disposiciones de la política de privacidad. Para el uso de SALUDBOT, también se le pondrá a disposición una política de privacidad específica para los servicios de reserva de citas médicas y consulta del estado de referencias, sin perjuicio de la aplicación de la presente Política de Privacidad de MINSA DIGITAL. En caso de no aceptar las condiciones informadas para el uso de estos canales de atención, el usuario podrá utilizar los otros canales institucionales alternativos disponibles.",
      },
    ],
  },
];
export const DATOS_PERSONALES_TITULO_TEXT = "Protección de datos personales";
export const DATOS_PERSONALES_CHECKBOX_LABEL = "Autorizo el tratamiento de mis datos personales";
