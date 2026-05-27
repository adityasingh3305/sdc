#include <algorithm>
#include <cmath>
#include <iostream>
#include <json/json.h>
#include <sstream>
#include <string>
#include <vector>

using namespace std;

const double BATTERY_CAP = 500.0;
const double EPS = 1e-9;

struct Pt {
    double x, y;
};

struct Drone {
    string id;
    double cap;
};

struct Delivery {
    string id;
    Pt p;
    double w;
    double deadline;
};

struct Zone {
    string shape;
    Pt c;
    double r = 0.0;
    double xmin = 0.0, ymin = 0.0, xmax = 0.0, ymax = 0.0;
    double ts = 0.0, te = 0.0;
};

double dist(Pt a, Pt b) {
    double dx = a.x - b.x, dy = a.y - b.y;
    return sqrt(dx * dx + dy * dy);
}

Json::Value step(Pt p, double t, const string &action) {
    Json::Value v;
    v["x"] = p.x;
    v["y"] = p.y;
    v["t"] = t;
    v["action"] = action;
    return v;
}

bool overlap(double a1, double a2, double b1, double b2) {
    return max(a1, b1) <= min(a2, b2) + 1e-7;
}

bool intervalCircle(Pt a, Pt b, const Zone &z, double &enter, double &exit) {
    double vx = b.x - a.x, vy = b.y - a.y;
    double len = sqrt(vx * vx + vy * vy);
    if (len < EPS) return false;
    double fx = a.x - z.c.x, fy = a.y - z.c.y;
    double A = vx * vx + vy * vy;
    double B = 2.0 * (fx * vx + fy * vy);
    double C = fx * fx + fy * fy - z.r * z.r;
    double D = B * B - 4.0 * A * C;
    if (D < -EPS) return false;
    D = max(0.0, D);
    double s1 = (-B - sqrt(D)) / (2.0 * A);
    double s2 = (-B + sqrt(D)) / (2.0 * A);
    double lo = max(0.0, min(s1, s2));
    double hi = min(1.0, max(s1, s2));
    if (lo > hi + EPS) return false;
    enter = lo * len;
    exit = hi * len;
    return true;
}

bool intervalRect(Pt a, Pt b, const Zone &z, double &enter, double &exit) {
    double vx = b.x - a.x, vy = b.y - a.y;
    double len = sqrt(vx * vx + vy * vy);
    if (len < EPS) return false;
    double t0 = 0.0, t1 = 1.0;
    auto clip = [&](double p, double q) -> bool {
        if (fabs(p) < EPS) return q >= -EPS;
        double r = q / p;
        if (p < 0) t0 = max(t0, r);
        else t1 = min(t1, r);
        return t0 <= t1 + EPS;
    };
    if (!clip(-vx, a.x - z.xmin)) return false;
    if (!clip(vx, z.xmax - a.x)) return false;
    if (!clip(-vy, a.y - z.ymin)) return false;
    if (!clip(vy, z.ymax - a.y)) return false;
    enter = max(0.0, t0) * len;
    exit = min(1.0, t1) * len;
    return enter <= exit + EPS;
}

bool blockedByZone(Pt a, Pt b, double depart, const Zone &z) {
    double enter = 0.0, exit = 0.0;
    bool hit = z.shape == "circle" ? intervalCircle(a, b, z, enter, exit)
                                   : intervalRect(a, b, z, enter, exit);
    if (!hit) return false;
    return overlap(depart + enter, depart + exit, z.ts, z.te);
}

double safeDepartTime(Pt a, Pt b, double depart, const vector<Zone> &zones) {
    bool changed = true;
    while (changed) {
        changed = false;
        for (const auto &z : zones) {
            if (blockedByZone(a, b, depart, z)) {
                depart = max(depart, z.te + 1e-6);
                changed = true;
            }
        }
    }
    return depart;
}

double routeEnergy(const vector<const Delivery*> &trip, Pt wh) {
    double payload = 0.0;
    for (auto d : trip) payload += d->w;
    double e = 0.0;
    Pt cur = wh;
    for (auto d : trip) {
        e += dist(cur, d->p) * (1.0 + payload);
        payload -= d->w;
        cur = d->p;
    }
    e += dist(cur, wh);
    return e;
}

double routeArrivalTime(const vector<const Delivery*> &trip, Pt wh, double start, const vector<Zone> &zones, vector<double> *arrivals = nullptr) {
    double t = start;
    Pt cur = wh;
    if (arrivals) arrivals->clear();
    for (auto d : trip) {
        t = safeDepartTime(cur, d->p, t, zones);
        t += dist(cur, d->p);
        if (arrivals) arrivals->push_back(t);
        cur = d->p;
    }
    t = safeDepartTime(cur, wh, t, zones);
    t += dist(cur, wh);
    return t;
}

struct TripPlan {
    vector<const Delivery*> stops;
    vector<double> arrivals;
    double endTime = 0.0;
    double energy = 0.0;
};

bool buildTrip(const vector<Delivery> &deliveries, const vector<char> &used, int droneIdx, double startTime,
               Pt wh, const vector<Zone> &zones, const Drone &drone, TripPlan &best) {
    vector<const Delivery*> cand;
    vector<double> arrivals;
    double payload = 0.0;
    double bestScore = -1.0;
    bool found = false;

    for (int i = 0; i < (int)deliveries.size(); ++i) {
        if (used[i]) continue;
        if (payload + deliveries[i].w > drone.cap + EPS) continue;

        vector<const Delivery*> next = cand;
        next.push_back(&deliveries[i]);
        vector<double> nextArrivals;
        double endTime = routeArrivalTime(next, wh, startTime, zones, &nextArrivals);
        double energy = routeEnergy(next, wh);

        bool ok = energy <= BATTERY_CAP + EPS;
        if (ok) {
            for (int j = 0; j < (int)next.size(); ++j) {
                if (nextArrivals[j] > next[j]->deadline + 1e-7) {
                    ok = false;
                    break;
                }
            }
        }

        if (!ok) continue;

        cand = next;
        arrivals = nextArrivals;
        payload += deliveries[i].w;
        found = true;

        double score = 0.0;
        for (auto d : cand) score += max(0.0, 10000.0 - d->deadline) + 1000.0 * d->w;
        if (score > bestScore) {
            bestScore = score;
            best.stops = cand;
            best.arrivals = arrivals;
            best.endTime = endTime;
            best.energy = energy;
        }
    }

    (void)droneIdx;
    return found;
}

int main() {
    string input_str((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
    Json::Value input_data;
    Json::CharReaderBuilder rb;
    string errs;
    istringstream ss(input_str);
    Json::parseFromStream(rb, ss, &input_data, &errs);

    double mapW = input_data["map_size"][0].asDouble();
    double mapH = input_data["map_size"][1].asDouble();
    Pt wh{mapW / 2.0, mapH / 2.0};

    vector<Drone> drones;
    for (const auto &d : input_data["drones"]) drones.push_back({d["id"].asString(), d["max_payload"].asDouble()});

    vector<Delivery> deliveries;
    for (const auto &d : input_data["deliveries"]) {
        deliveries.push_back({d["id"].asString(), {d["x"].asDouble(), d["y"].asDouble()}, d["weight"].asDouble(), d["deadline"].asDouble()});
    }

    vector<Zone> zones;
    for (const auto &zv : input_data.get("no_fly_zones", Json::Value(Json::arrayValue))) {
        Zone z;
        z.shape = zv["shape"].asString();
        z.ts = zv["T_start"].asDouble();
        z.te = zv["T_end"].asDouble();
        if (z.shape == "circle") {
            z.c = {zv["center"][0].asDouble(), zv["center"][1].asDouble()};
            z.r = zv["radius"].asDouble();
        } else {
            z.xmin = min(zv["corners"][0][0].asDouble(), zv["corners"][1][0].asDouble());
            z.ymin = min(zv["corners"][0][1].asDouble(), zv["corners"][1][1].asDouble());
            z.xmax = max(zv["corners"][0][0].asDouble(), zv["corners"][1][0].asDouble());
            z.ymax = max(zv["corners"][0][1].asDouble(), zv["corners"][1][1].asDouble());
        }
        zones.push_back(z);
    }

    sort(deliveries.begin(), deliveries.end(), [&](const Delivery &a, const Delivery &b) {
        if (fabs(a.deadline - b.deadline) > EPS) return a.deadline < b.deadline;
        return dist(wh, a.p) < dist(wh, b.p);
    });
    sort(drones.begin(), drones.end(), [](const Drone &a, const Drone &b) { return a.cap > b.cap; });

    vector<double> droneTime(drones.size(), 0.0);
    vector<Json::Value> paths(drones.size(), Json::Value(Json::arrayValue));
    vector<char> used(deliveries.size(), 0);

    int remaining = deliveries.size();
    while (remaining > 0) {
        int bestDrone = -1;
        TripPlan bestTrip;
        for (int i = 0; i < (int)drones.size(); ++i) {
            TripPlan candidate;
            if (!buildTrip(deliveries, used, i, droneTime[i], wh, zones, drones[i], candidate)) continue;
            if (bestDrone < 0 || droneTime[i] < droneTime[bestDrone] ||
                (fabs(droneTime[i] - droneTime[bestDrone]) <= EPS && candidate.stops.size() > bestTrip.stops.size())) {
                bestDrone = i;
                bestTrip = candidate;
            }
        }
        if (bestDrone < 0 || bestTrip.stops.empty()) break;

        Json::Value pickup = step(wh, droneTime[bestDrone], "PICKUP");
        Json::Value ids(Json::arrayValue);
        for (auto d : bestTrip.stops) ids.append(d->id);
        pickup["delivery_ids"] = ids;
        paths[bestDrone].append(pickup);

        double t = droneTime[bestDrone];
        Pt cur = wh;
        for (auto d : bestTrip.stops) {
            double depart = safeDepartTime(cur, d->p, t, zones);
            if (depart > t + 1e-7) {
                Json::Value wait = step(cur, depart, "WAIT");
                paths[bestDrone].append(wait);
                t = depart;
            }
            t += dist(cur, d->p);
            Json::Value del = step(d->p, t, "DELIVER");
            del["delivery_id"] = d->id;
            paths[bestDrone].append(del);
            for (int i = 0; i < (int)deliveries.size(); ++i) {
                if (&deliveries[i] == d) {
                    used[i] = 1;
                    --remaining;
                    break;
                }
            }
            cur = d->p;
        }
        double depart = safeDepartTime(cur, wh, t, zones);
        if (depart > t + 1e-7) {
            Json::Value wait = step(cur, depart, "WAIT");
            paths[bestDrone].append(wait);
            t = depart;
        }
        t += dist(cur, wh);
        paths[bestDrone].append(step(wh, t, "RETURN"));
        droneTime[bestDrone] = t;
    }

    Json::Value flight_manifest(Json::arrayValue);
    for (int i = 0; i < (int)drones.size(); ++i) {
        if (paths[i].empty()) continue;
        Json::Value entry;
        entry["drone_id"] = drones[i].id;
        entry["path"] = paths[i];
        flight_manifest.append(entry);
    }

    Json::Value output;
    output["flight_manifest"] = flight_manifest;
    Json::StreamWriterBuilder wb;
    wb["indentation"] = "";
    cout << Json::writeString(wb, output) << endl;
    return 0;
}
