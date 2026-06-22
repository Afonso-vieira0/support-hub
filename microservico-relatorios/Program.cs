using System.Text.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("PermitirSite", policy =>
    {
        policy.WithOrigins("http://localhost:8080", "http://192.168.1.204:8080")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddHttpClient();

var app = builder.Build();

app.UseCors("PermitirSite");

// ──────────────────────────────────────────────
// Configuração do Supabase (lida de variáveis de ambiente — nunca hardcoded)
// ──────────────────────────────────────────────
var supabaseUrl = Environment.GetEnvironmentVariable("SUPABASE_URL")
    ?? throw new InvalidOperationException("Variavel de ambiente SUPABASE_URL nao definida.");
var supabaseKey = Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")
    ?? throw new InvalidOperationException("Variavel de ambiente SUPABASE_SERVICE_ROLE_KEY nao definida.");

// ──────────────────────────────────────────────
// Helper: faz GET à REST API do Supabase
// ──────────────────────────────────────────────
async Task<JsonElement> SupabaseGet(IHttpClientFactory factory, string path)
{
    var client = factory.CreateClient();
    client.DefaultRequestHeaders.Add("apikey", supabaseKey);
    client.DefaultRequestHeaders.Add("Authorization", $"Bearer {supabaseKey}");

    var response = await client.GetAsync($"{supabaseUrl}/rest/v1/{path}");
    response.EnsureSuccessStatusCode();
    var json = await response.Content.ReadAsStringAsync();
    return JsonDocument.Parse(json).RootElement;
}

// ──────────────────────────────────────────────
// GET /relatorios/tickets
// ──────────────────────────────────────────────
app.MapGet("/relatorios/tickets", async (IHttpClientFactory factory) =>
{
    var tickets = await SupabaseGet(factory,
        "tickets?select=id,status,category,technician_id,created_at,resolved_at&deleted_at=is.null");

    var metrics = await SupabaseGet(factory,
        "ticket_metrics?select=ticket_id,total_resolution_seconds,time_to_first_response_seconds");

    var ratings = await SupabaseGet(factory,
        "ticket_ratings?select=ticket_id,stars,solved");

    var ticketList = tickets.EnumerateArray().ToList();

    var porStatus = ticketList
        .GroupBy(t => t.GetProperty("status").GetString() ?? "desconhecido")
        .ToDictionary(g => g.Key, g => g.Count());

    var porCategoria = ticketList
        .GroupBy(t => t.GetProperty("category").GetString() ?? "desconhecido")
        .ToDictionary(g => g.Key, g => g.Count());

    var semTecnico = ticketList.Count(t =>
        t.GetProperty("technician_id").ValueKind == JsonValueKind.Null);

    var temposResolucao = metrics.EnumerateArray()
        .Where(m => m.GetProperty("total_resolution_seconds").ValueKind != JsonValueKind.Null)
        .Select(m => m.GetProperty("total_resolution_seconds").GetDouble())
        .ToList();

    var mediaResolucaoHoras = temposResolucao.Count > 0
        ? Math.Round(temposResolucao.Average() / 3600, 1)
        : (double?)null;

    var temposPrimeiraResposta = metrics.EnumerateArray()
        .Where(m => m.GetProperty("time_to_first_response_seconds").ValueKind != JsonValueKind.Null)
        .Select(m => m.GetProperty("time_to_first_response_seconds").GetDouble())
        .ToList();

    var mediaPrimeiraRespostaMin = temposPrimeiraResposta.Count > 0
        ? Math.Round(temposPrimeiraResposta.Average() / 60, 1)
        : (double?)null;

    var ratingList = ratings.EnumerateArray().ToList();
    var mediaEstrelas = ratingList.Count > 0
        ? Math.Round(ratingList.Average(r => r.GetProperty("stars").GetDouble()), 2)
        : (double?)null;
    var taxaResolvidos = ratingList.Count > 0
        ? Math.Round(ratingList.Count(r => r.GetProperty("solved").GetBoolean()) * 100.0 / ratingList.Count, 1)
        : (double?)null;

    var resultado = new
    {
        geradoEm = DateTime.UtcNow,
        totalTickets = ticketList.Count,
        semTecnicoAtribuido = semTecnico,
        porStatus,
        porCategoria,
        temposResolucao = new
        {
            mediaHoras = mediaResolucaoHoras,
            ticketsComDados = temposResolucao.Count
        },
        primeiraResposta = new
        {
            mediaMinutos = mediaPrimeiraRespostaMin,
            ticketsComDados = temposPrimeiraResposta.Count
        },
        satisfacao = new
        {
            mediaEstrelas,
            totalAvaliacoes = ratingList.Count,
            taxaResolvidosPct = taxaResolvidos
        }
    };

    return Results.Ok(resultado);
});

app.Run();
