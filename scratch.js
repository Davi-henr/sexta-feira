fetch("https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyAEspUJ9wBQdBMVi2EO4ZvFJmrrfbm-Z58")
  .then(res => res.json())
  .then(data => {
    console.log("AVAILABLE MODELS:");
    if (data.models) {
      data.models.forEach(m => console.log(m.name, m.supportedGenerationMethods));
    } else {
      console.log(data);
    }
  });
