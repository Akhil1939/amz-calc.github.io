import { CommonModule } from '@angular/common';
import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule, ReactiveFormsModule, Validators, FormBuilder } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

export interface Item {
  id: string;
  name: string;
  price: number; // selling price per item
  cost: number; // cost per item
  amazonFees: number; // amazon fees per item
  sold: number; // number sold
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatToolbarModule,
    MatIconModule,
    MatTableModule,
    MatInputModule,
    MatButtonModule,
    MatFormFieldModule,
    MatCardModule,
    MatSnackBarModule,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App {
  // Columns for table
  displayedColumns = ['name', 'price', 'cost', 'amazonFees', 'sold', 'profit', 'actions'];

  // items stored as a signal
  items = signal<Item[]>([]);

  // search string (simple property, will be used inside computed)
  search = '';

  // form
  private fb = inject(FormBuilder);
  form = this.fb.nonNullable.group({
    id: [''],
    name: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    cost: [0, [Validators.required, Validators.min(0)]],
    amazonFees: [0, [Validators.required, Validators.min(0)]],
    sold: [0, [Validators.required, Validators.min(0)]],
  });

  // computed filtered items (reactive)
  filteredItems = computed(() => {
    const q = this.search?.trim().toLowerCase();
    const arr = this.items();
    if (!q) return arr;
    return arr.filter((i) => i.name.toLowerCase().includes(q));
  });

  // computed totals:
  totalSold = computed(() => this.items().reduce((s, it) => s + (it.sold || 0), 0));
  // total revenue = sum(price * sold)
  totalRevenue = computed(() =>
    this.items().reduce((s, it) => s + (it.price || 0) * (it.sold || 0), 0)
  );
  // total cost = sum(cost * sold)
  totalCost = computed(() =>
    this.items().reduce((s, it) => s + (it.cost || 0) * (it.sold || 0), 0)
  );
  // total fees = sum(amazonFees * sold)
  totalFees = computed(() =>
    this.items().reduce((s, it) => s + (it.amazonFees || 0) * (it.sold || 0), 0)
  );
  // total profit = revenue - cost - fees
  totalProfit = computed(() => this.totalRevenue() - this.totalCost() - this.totalFees());

  constructor() {
    // load from localStorage if present
    const saved = localStorage.getItem('amazon-items');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Item[];
        // defensive sanitization of numbers
        parsed.forEach((p) => {
          p.price = Number(p.price) || 0;
          p.cost = Number(p.cost) || 0;
          p.amazonFees = Number(p.amazonFees) || 0;
          p.sold = Number(p.sold) || 0;
        });
        this.items.set(parsed);
      } catch (e) {
        console.warn('Failed to parse saved items', e);
      }
    }
  }

  // per-item profit (single item)
  perItemProfit(item: Item) {
    return ((item.price || 0) - (item.cost || 0) - (item.amazonFees || 0)) * (item.sold || 0);
  }

  // Add or update
  addOrUpdate() {
    if (this.form.invalid) return;
    const val = this.form.value as Item;
    // normalize numbers
    val.price = Number(val.price) || 0;
    val.cost = Number(val.cost) || 0;
    val.amazonFees = Number(val.amazonFees) || 0;
    val.sold = Number(val.sold) || 0;

    if (val.id) {
      // update existing entry immutably
      this.items.update((arr) => arr.map((i) => (i.id === val.id ? { ...val } : i)));
    } else {
      // new id and push immutably
      val.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      this.items.update((arr) => [...arr, { ...val }]);
    }
    this.saveLocal();
    this.form.reset({ id: '', name: '', price: 0, cost: 0, amazonFees: 0, sold: 0 });
  }

  // edit populate form
  edit(item: Item) {
    this.form.patchValue({ ...item });
  }

  // remove item
  remove(item: Item) {
    this.items.update((arr) => arr.filter((i) => i.id !== item.id));
    this.saveLocal();
  }

  // save to localStorage
  saveLocal() {
    localStorage.setItem('amazon-items', JSON.stringify(this.items()));
  }

  // download JSON file of items
  downloadJSON() {
    const blob = new Blob([JSON.stringify(this.items(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'amazon-items.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Upload JSON (expects array of items)
  uploadJSON(event: any) {
    const f = event.target.files && event.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Item[];
        if (Array.isArray(data)) {
          // normalize numeric fields
          data.forEach((p) => {
            p.price = Number(p.price) || 0;
            p.cost = Number(p.cost) || 0;
            p.amazonFees = Number(p.amazonFees) || 0;
            p.sold = Number(p.sold) || 0;
            if (!p.id) p.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
          });
          console.log('Uploading items', data);
          this.items.set(data);
          this.saveLocal();
        } else {
          alert('Uploaded JSON must be an array of items');
        }
      } catch (e) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(f);
    // reset input
    event.target.value = '';
  }

  // Export current items to CSV (all items + totals row)
  exportCSV() {
    const header = ['name', 'price', 'cost', 'amazonFees', 'sold', 'profit'];

    const rows = this.items().map((it) => [
      it.name,
      it.price,
      it.cost,
      it.amazonFees,
      it.sold,
      this.perItemProfit(it),
    ]);

    // --- Totals row appended at end ---
    const totalsRow = [
      'TOTALS',
      this.totalRevenue(),
      this.totalCost(),
      this.totalFees(),
      this.totalSold(),
      this.totalProfit(),
    ];

    const allRows = [header, ...rows, totalsRow];

    const csv = allRows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell).replace(/"/g, '""');
            return `"${s}"`;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'amazon-items.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
