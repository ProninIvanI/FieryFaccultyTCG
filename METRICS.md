# Universal Metrics Contract

Версия: 1.0
Последнее обновление: 2025-12-24
Область: все приложения экосистемы, независимо от языка реализации

Назначение:
- единый стандарт метрик
- безопасная кардинальность
- возможность универсальных дашбордов и алертов
- масштабируемость по языкам и типам сервисов

---

## 0. Общие принципы (обязательны для всех)

### 0.1 Metrics endpoint
- Обязательный endpoint: `GET /metrics`
- Формат: Prometheus exposition
- Endpoint `/metrics` (НЕ должен учитываться в HTTP-метриках приложения)

### 0.2 Cardinality rules (СТРОГО)
Запрещено использовать в labels:
- любые идентификаторы (id, uuid, request_id)
- user_id, station_id, device_id
- IP-адреса, hostname клиента
- query parameters
- тексты ошибок
- динамические пути

Разрешено:
- конечные множества значений (enum)
- шаблоны маршрутов (`/entities/:id`)

### 0.3 Naming conventions
- snake_case
- counters оканчиваются на `_total`
- единицы измерения в имени (`_seconds`, `_bytes`)
- gauge - текущее состояние
- histogram - распределения и latency

### 0.4 Histogram buckets
- buckets задаются библиотекой клиента по умолчанию
- единый список buckets в контракте не фиксируется

### 0.5 Dashboard sync for AI agents
- При изменении, добавлении, удалении метрик или изменении их семантики агент обязан в финальном ответе приложить краткую инструкцию для Grafana AI agent.
- Инструкция должна перечислять, какие панели, запросы, фильтры, названия или описания в дашборде нужно обновить.
- Если правки дашборда не требуются, агент обязан явно указать это в финальном ответе.

---

## 1. Process / Runtime (обязательные для всех языков)

| Metric | Type | Description |
|------|----|------------|
| process_resident_memory_bytes | gauge | Реальное потребление RAM |
| process_cpu_seconds_total | counter | CPU time |
| process_start_time_seconds | gauge | Время старта процесса |
| process_open_fds | gauge | Открытые file descriptors (если применимо) |
| process_max_fds | gauge | Лимит file descriptors |

Дополнительно (если доступно):
- process_network_receive_bytes_total
- process_network_transmit_bytes_total

---

## 2. Build / Version

build_info{version,commit} 1

Правила:
- version - semver или tag
- commit - git sha
- build_date НЕ используется как label

---

## 3. HTTP server (если используется)

### 3.1 Requests
http_requests_total{method,route,status}

### 3.2 Latency
http_request_duration_seconds_bucket{method,route,status}
http_request_duration_seconds_sum{method,route,status}
http_request_duration_seconds_count{method,route,status}

status - HTTP код ответа

### 3.3 In-flight requests
http_requests_in_flight

---

## 4. External dependencies (если используются, например вызовы других API)

external_calls_total{service,method,result}
external_call_duration_seconds_bucket{service,method}

---

## 5. Messaging / Streaming systems (если используется, например Kafka, RabbitMQ)

messages_sent_total{system,channel_group}
messages_failed_total{system,channel_group,reason}

---

## 6. Queues / Buffers / Backpressure (если используется, например внутренние очереди задач)

queue_depth{queue}
queue_dropped_total{queue,reason}
queue_processing_duration_seconds_bucket{queue}

---

## 7. WebSocket (если используется)

websocket_connections_active
websocket_messages_sent_total
websocket_messages_received_total
websocket_messages_failed_total{reason}

---

## 8. TCP connections (если используется напрямую)

tcp_connections_active
tcp_connections_accepted_total
tcp_connections_closed_total{reason}
tcp_bytes_received_total
tcp_bytes_sent_total

---

## 9. Errors / Panics / Restarts

errors_total{component,reason}
panics_total

Restarts определяются через changes(process_start_time_seconds)

---

## 10. SLO / Business operations (опционально)

operations_total{operation,result}
operation_duration_seconds_bucket{operation}

---

## 11. Метрики по языкам

Разделы ниже применяются только для конкретного языка реализации.

### 11.1 Go (golang)

Обязательные метрики для Go приложений:
go_goroutines
go_threads
go_memstats_heap_alloc_bytes
go_memstats_heap_inuse_bytes
go_memstats_heap_objects
go_memstats_sys_bytes
go_memstats_alloc_bytes_total
go_memstats_last_gc_time_seconds
go_memstats_last_gc_time_seconds
go_gc_duration_seconds (summary)

