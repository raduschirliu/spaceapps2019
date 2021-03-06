import { Component, OnInit, EventEmitter } from '@angular/core';
import * as mapboxgl from 'mapbox-gl';
import { keys } from '../../keys';
import { HttpClient } from '@angular/common/http';
import { tap, take } from 'rxjs/operators';
import { AngularFireStorage } from '@angular/fire/storage';
import { MatDialog, MatSnackBar } from '@angular/material';
import { FireReportComponent } from '../fire-report/fire-report.component';
import { AngularFirestore } from '@angular/fire/firestore';
import { AboutComponent } from '../about/about.component';
import { FilterComponent } from '../filter/filter.component';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent implements OnInit {
  map: mapboxgl.Map;
  mapNav: mapboxgl.NavigationControl;
  hasData = false;
  filterWindow = false;
  firstLayerId: string;
  userData = {
    type: 'FeatureCollection',
    features: []
  };
  nasaData = {
    type: 'FeatureCollection',
    features: []
  };
  filters = {
    showUserFires: true,
    showNasaFires: true,
    time: 7
  };

  get hasFilters() {
    return this.filters.time !== 7 || this.filters.showUserFires !== true || this.filters.showNasaFires !== true;
  }

  constructor(
    private http: HttpClient,
    private storage: AngularFireStorage,
    private db: AngularFirestore,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit() {
    this.initMap();

    // Add layer with 7days of fire data
    this.map.on('load', () => {
      const layers = this.map.getStyle().layers;

      // tslint:disable-next-line:prefer-for-of
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol') {
          this.firstLayerId = layers[i].id;
          break;
        }
      }

      this.map.addSource('user', { type: 'geojson', data: null });
      this.map.addSource('nasa', { type: 'geojson', data: null });

      this.addLayer('user', '#ff0000');
      this.addLayer('nasa', '#ff8c00');

      this.snackBar.open('Loading Fire Reports...', 'Okay', { duration: 1000 });

      // Load user data
      this.getUserData();

      // Load NASA data
      this.storage.ref('world_fire_data_7d.json')
        .getDownloadURL()
        .pipe(
          take(1)
        )
        .subscribe(url => {
          this.http.get(url).pipe(tap((res: any) => {
            this.nasaData = res;
            this.updateData('nasa', res);

            setTimeout(() => {
              this.hasData = true;
              this.snackBar.dismiss();
              this.snackBar.open(
                `Loaded ${res.features.length} data points (It may take a few seconds to populate the map...)`,
                'Okay',
                { duration: 1500 }
              );
            }, 2500);

            this.addPopup('nasa');
            this.addPopup('user');
          }))
          .pipe(
            take(1)
          ).subscribe();
        }
      );
    });
  }

  addPopup(id: string) {
    this.map.on('click', id + '-circles', e => {
      let date: Date;
      // @ts-ignore
      const coords = e.features[0].geometry.coordinates;
      const userReport = e.features[0].properties.userReport;
      const type = userReport ? 'User Report' : 'NASA Report';
      const desc = e.features[0].properties.description;
      let time = 'N/A';

      console.log(e.features[0]);

      if (e.features[0].properties.date) {
        date = new Date(JSON.parse(e.features[0].properties.date).seconds * 1000);
      } else {
        date = new Date(e.features[0].properties.ACQ_DATE);
      }

      if (e.features[0].properties.time) {
        time = e.features[0].properties.time;
      } else {
        time = e.features[0].properties.ACQ_TIME.substring(0, 2) + ':' + e.features[0].properties.ACQ_TIME.substring(2, 4);
      }

      let html = `
        <b>Date Reported:</b> ${date.toLocaleDateString()}<br/>
        <b>Time Reported:</b> ${time}<br/>
        <b>Coordinates:</b> <br/>
        <p style="margin: 0px 0px 0px 10px;"><b>Long</b>: ${coords[0]},</p>
        <p style="margin: 0px 0px 0px 10px;"><b>Lat</b>: ${coords[1]}</p>
        <b>Type:</b> ${type}<br/>
      `;

      if (desc != null && desc !== '' && desc !== ' ') {
        html += `
          <b>Description:</b> ${desc}<br/>
        `;
      }

      if (!userReport) {
        const day = e.features[0].properties.DAYNIGHT === 'D' ? 'Day' : 'Night';
        const confidence = e.features[0].properties.CONFIDENCE;

        html += `
          <b>Day or Night:</b> ${day}<br/>
          <b>Report Confidence:</b> ${confidence}%</br>
        `;
      }

      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(this.map);
    });

    this.map.on('mouseenter', id + '-circles', () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', id + '-circles', () => {
      this.map.getCanvas().style.cursor = '';
    });
  }

  getUserData() {
    this.db.collection('fires')
      .get()
      .pipe(
        take(1)
      )
      .subscribe(snapshot => {
        const jsonData = {
          type: 'FeatureCollection',
          features: []
        };

        snapshot.docs.forEach(doc => {
          jsonData.features.push(doc.data());
        });

        this.userData = jsonData;
        this.updateData('user', jsonData as any);
      }
    );
  }

  filterData(data: any, func: any) {
    const d = {
      type: 'FeatureCollection',
      features: data.features.filter(func)
    };

    console.log(this.filters);
    console.log(d);
    return d;
  }

  nearMe() {
    if (!navigator) {
      console.log('Error sorry no nav');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        if (pos) {
          this.map.flyTo({
            center: [
              pos.coords.longitude,
              pos.coords.latitude
          ],
          zoom: 7
          });
        }
      },
      err => {
        console.log('Error ' + err);
      }
    );
  }

  report() {
    this.dialog.open(FireReportComponent)
      .afterClosed()
      .pipe(
        take(1)
      )
      .subscribe(res => {
        if (res === true) {
          this.getUserData();
        }
      });
  }

  filter() {
    this.dialog.open(FilterComponent, {
      data: Object.assign({
        total: this.nasaData.features.length + this.userData.features.length,
        nasaFires: this.nasaData.features.length,
        userFires: this.userData.features.length
      }, this.filters)
    }).afterClosed()
      .pipe(take(1))
      .subscribe(res => {
        if (!res) { return; }

        this.snackBar.open('Filters Updated (This may take a moment to load...)', 'Okay', { duration: 1500 });

        if (res.reset === true) {
          this.filters = {
            showUserFires: true,
            showNasaFires: true,
            time: 7
          };

          this.setLayerVisibility('user', true);
          this.setLayerVisibility('nasa', true);

          this.updateData('user', this.userData);
          this.updateData('nasa', this.nasaData);

          return;
        }

        res.reset = undefined;
        this.filters = res;

        this.setLayerVisibility('user', res.showUserFires);
        this.setLayerVisibility('nasa', res.showNasaFires);

        const now = new Date();

        const filterDates = e => {
          let date: Date;

          if (e.properties.date) {
            date = new Date(e.properties.date.seconds * 1000);
          } else {
            date = new Date(e.properties.ACQ_DATE);
          }

          let diff;

          try {
            diff = now.getTime() - date.getTime();
          } catch (err) {
            console.log(e);
            console.error(err);
          }

          const dayDiff = Math.floor(diff / (24 * 60 * 60 * 1000));

          return dayDiff <= this.filters.time;
        };

        this.updateData('nasa', this.filterData(this.nasaData, filterDates));
        this.updateData('user', this.filterData(this.userData, filterDates));
      }
    );
  }

  about() {
    this.dialog.open(AboutComponent);
  }

  private initMap() {
    // @ts-ignore
    mapboxgl.accessToken = keys.mapbox;
    this.map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v11',
      zoom: 1
    });

    // add navbar
    this.mapNav = new mapboxgl.NavigationControl();
    this.map.addControl(this.mapNav, 'bottom-right');
  }

  private setLayerVisibility(id: string, state: boolean) {
    const vis = state ? 'visible' : 'none';
    this.map.setLayoutProperty(id + '-heatmap', 'visibility', vis);
    this.map.setLayoutProperty(id + '-circles', 'visibility', vis);
  }

  private updateData(id: string, data: any) {
    (this.map.getSource(id) as mapboxgl.GeoJSONSource).setData(data);
  }

  private addLayer(id: string, color: string) {
    // adding two layes one for heatmap and one for circle
    this.map.addLayer({
      id: id + '-heatmap',
      type: 'heatmap',
      source: id,
      layout: {
        visibility: 'visible'
      },
      paint: {
        // Increase the heatmap weight based on frequency and property magnitude
        'heatmap-weight': [
          'interpolate',
          ['linear'],
          ['get', 'mag'],
          0, 0,
          6, 1
        ],
        // Increase the heatmap color weight weight by zoom level
        // heatmap-intensity is a multiplier on top of heatmap-weight
        'heatmap-intensity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 1,
          9, 3
        ],
        // Color ramp for heatmap.  Domain is 0 (low) to 1 (high).
        // Begin color ramp at 0-stop with a 0-transparancy color
        // to create a blur-like effect.
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(33,102,172,0)',
          0.2, 'rgb(103,169,207)',
          0.4, 'rgb(209,229,240)',
          0.6, 'rgb(253,219,199)',
          0.8, 'rgb(239,138,98)',
          1, color
        ],
        // Adjust the heatmap radius by zoom level
        'heatmap-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 2,
          9, 20
        ],
        // Transition from heatmap to circle layer by zoom level
        'heatmap-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          7, 1,
          9, 0
        ]
      }
    }, this.firstLayerId);

    this.map.addLayer({
      id: id + '-circles',
      type: 'circle',
      source: id,
      layout: {
        visibility: 'visible'
      },
      paint: {
        'circle-radius': 4,
        'circle-color': color,
        'circle-stroke-color': 'white',
        'circle-stroke-width': 1,
        'circle-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          7, 0,
          8, 1
        ],
        'circle-stroke-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          7, 0,
          8, 1
        ]
      }
    }, this.firstLayerId);
  }

}
