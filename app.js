const BOOKS_JSON = 'books.json';
const PAGE_SIZE = 8;

let state = {
  books: [],
  filtered: [],
  page: 1,
  genre: 'All',
  cart: JSON.parse(localStorage.getItem('bookstore_cart') || '[]'),
};

// --- Storage ---
function saveBooksToStorage(){
  localStorage.setItem('bookstore_books', JSON.stringify(state.books));
}

// --- Load Initial Books ---
function loadInitialBooks(){
  const local = localStorage.getItem('bookstore_books');
  if(local){
    state.books = JSON.parse(local);
    initAfterBooks();
  } else {
    $.ajax({
      url: BOOKS_JSON,
      method: 'GET',
      dataType: 'json',
      success: function(data){
        state.books = data;
        initAfterBooks();
      },
      error: function(xhr, status, err){
        console.error('Failed loading books.json.', err);
        state.books = [];
        initAfterBooks();
      }
    });
  }
}

function initAfterBooks(){
  state.books = state.books.map((b,i)=>({ id: b.id ?? i+1, rating: b.rating ?? 0, reviews: b.reviews ?? [], ...b }));
  renderGenres();
  applyFilter();
  renderCartCount();
  bindUI();
}

// Helper to set cover with preload + fallback
const _placeholderCover = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%" height="100%" fill="%230b2b28"/><text x="50%" y="50%" dominant-ba[...]
function setCover($el, url){
  if(!url){
    $el.css('background-image', `url("${_placeholderCover}")`);
    return;
  }
  const img = new Image();
  img.onload = ()=> { $el.css('background-image', `url('${url}')`); };
  img.onerror = ()=> { $el.css('background-image', `url("${_placeholderCover}")`); };
  img.src = url;
}

// --- Genres ---
function renderGenres(){
  const genres = ['All',...new Set(state.books.map(b=>b.genre).filter(Boolean))];
  const ul = $('#genre-list').empty();
  genres.forEach(g=>{
    const li = $(`<li>${g}</li>`);
    if(g === state.genre) li.addClass('active');
    li.on('click', ()=> {
      state.genre = g;
      $('#genre-list li').removeClass('active');
      li.addClass('active');
      state.page = 1;
      applyFilter();
    });
    ul.append(li);
  });
}

// --- Filtering & Rendering ---
function applyFilter(){
  const q = $('#search').val()?.toLowerCase() || '';
  state.filtered = state.books.filter(b => {
    const matchesGenre = (state.genre === 'All') || b.genre === state.genre;
    const matchesQuery = !q || (b.title + ' ' + b.author + ' ' + b.description).toLowerCase().includes(q);
    return matchesGenre && matchesQuery;
  });
  renderFeatured();
  renderGrid();
  renderPopular();
  renderAuthors();
}

// --- Featured / Grid / Popular / Authors ---
function renderFeatured(){
  const row = $('#featured-row').empty();
  const featured = [...state.books].sort((a,b)=> (b.rating||0)-(a.rating||0)).slice(0,6);
  featured.forEach(b=>{
    const el = $(`
      <div class="featured-card" data-id="${b.id}" title="${b.title}">
        <div class="cover"></div>
        <strong>${b.title}</strong>
        <small>${b.author}</small>
      </div>`);
    setCover(el.find('.cover'), b.cover);
    el.on('click', ()=> openManageModal(b.id,'details'));
    row.append(el);
  });
}

function renderGrid(){
  const grid = $('#books-grid').empty();
  const start = (state.page-1)*PAGE_SIZE;
  const pageItems = state.filtered.slice(start, start+PAGE_SIZE);
  pageItems.forEach(b=>{
    const el = $(`
      <div class="book" data-id="${b.id}" title="${b.title}">
        <div class="cover"></div>
        <h5>${b.title}</h5>
        <p>${b.author}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto">
          <small>$${parseFloat(b.price).toFixed(2)}</small>
          <div>
            <button class="btn small add-cart">Add</button>
          </div>
        </div>
      </div>`);
    setCover(el.find('.cover'), b.cover);
    el.find('.add-cart').on('click', (e)=>{ e.stopPropagation(); addToCart(b.id); });
    el.on('click', ()=> openManageModal(b.id,'details'));
    grid.append(el);
  });

  const pages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  const pag = $('#pagination').empty();
  for(let i=1;i<=pages;i++){
    const p = $(`<button class="page-btn ${i===state.page?'active':''}">${i}</button>`);
    p.on('click', ()=>{ state.page = i; renderGrid(); });
    pag.append(p);
  }
}

function renderPopular(){
  const list = $('#popular-list').empty();
  const popular = [...state.books].sort((a,b)=> (b.rating||0)-(a.rating||0)).slice(0,5);
  popular.forEach(b=>{
    const it = $(`<div class="pop-item">
      <div class="small-cover"></div>
      <div>
        <div style="font-weight:600">${b.title}</div>
        <small style="color:var(--muted)">${b.author}</small>
      </div>
    </div>`);
    setCover(it.find('.small-cover'), b.cover);
    it.on('click', ()=> openManageModal(b.id,'details'));
    list.append(it);
  });
}

function renderAuthors(){
  const authorsEl = $('#authors-list').empty();
  const byAuthor = {};
  state.books.forEach(b=> byAuthor[b.author]=(byAuthor[b.author]||0)+1);
  Object.entries(byAuthor).sort((a,b)=> b[1]-a[1]).slice(0,8).forEach(([a,c])=>{
    const initials = (a||'').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
    const node = $(
      `<div class="author" data-author="${a}">
        <div class="author-left">
          <div class="author-avatar" aria-hidden="true">${initials}</div>
          <div class="author-name">${a}</div>
        </div>
        <div class="author-count">${c} <small>books</small></div>
      </div>`);
    node.on('click', ()=>{
      // quick filter by author
      state.genre = 'All';
      $('#genre-list li').removeClass('active');
      state.page = 1;
      $('#search').val(a);
      applyFilter();
    });
    authorsEl.append(node);
  });
}

// --- Reusable Modal ---
function openManageModal(bookId,type='manage'){
  // ensure manage editor is hidden when opening the reusable details/cart/about modal
  $('#manage-modal').addClass('hidden');
  const body = $('#modal-body').empty();

  if(type==='details'){
    const book = state.books.find(b=>b.id==bookId);
    if(!book) return;
    const img = $('<div class="modal-cover"></div>');
    setCover(img, book.cover);
    const title = $(`<h3>${book.title}</h3>`);
    const meta = $(`<div><strong>${book.author}</strong> • ${book.genre} • <strong>$${parseFloat(book.price).toFixed(2)}</strong></div>`);
    const desc = $(`<p>${book.description || 'No description provided.'}</p>`);
    const ratingBox = $(`
      <div style="margin-top:10px">
        <div>Rating: <span id="rating-val">${(book.rating||0).toFixed(1)}</span> ★</div>
        <div style="margin-top:6px">
          <button class="btn small add-cart">Add to Cart</button>
        </div>
      </div>`);
    ratingBox.find('.add-cart').on('click', ()=> addToCart(book.id));
    body.append(img,title,meta,desc,ratingBox);
  } else if(type==='cart'){
    if(state.cart.length===0){ body.append('<p>Cart is empty.</p>'); }
    else {
      const list = $('<ul></ul>');
      state.cart.forEach(item=>{
        const b = state.books.find(x=>x.id==item.id);
        const li = $(
          `<li class="cart-item" data-id="${b.id}">
            <div class="cart-thumb"></div>
            <div class="cart-info">
              <div class="cart-title">${b.title}</div>
              <small class="cart-author">${b.author}</small>
              <div class="cart-controls">
                <button class="cart-dec" title="Decrease">-</button>
                <span class="cart-qty-num">${item.qty}</span>
                <button class="cart-inc" title="Increase">+</button>
              </div>
            </div>
            <div class="cart-meta">$${(b.price*item.qty).toFixed(2)}</div>
            <button class="cart-remove" title="Remove"><i class="fa-solid fa-trash"></i></button>
          </li>`);
        setCover(li.find('.cart-thumb'), b.cover);

        // increment
        li.find('.cart-inc').on('click', (e)=>{
          e.stopPropagation();
          const id = b.id;
          const it = state.cart.find(c=>c.id==id);
          if(it){ it.qty++; }
          localStorage.setItem('bookstore_cart', JSON.stringify(state.cart));
          renderCartCount();
          openManageModal(null,'cart');
        });
        // decrement
        li.find('.cart-dec').on('click', (e)=>{
          e.stopPropagation();
          const id = b.id;
          const itIdx = state.cart.findIndex(c=>c.id==id);
          if(itIdx>-1){
            state.cart[itIdx].qty--;
            if(state.cart[itIdx].qty<=0) state.cart.splice(itIdx,1);
          }
          localStorage.setItem('bookstore_cart', JSON.stringify(state.cart));
          renderCartCount();
          openManageModal(null,'cart');
        });
        // remove
        li.find('.cart-remove').on('click', (e)=>{
          e.stopPropagation();
          const id = b.id;
          state.cart = state.cart.filter(c=>c.id!=id);
          localStorage.setItem('bookstore_cart', JSON.stringify(state.cart));
          renderCartCount();
          openManageModal(null,'cart');
        });

        list.append(li);
      });
      body.append('<h3>Cart Items</h3>', list);
      const total = state.cart.reduce((sum,i)=>{
        const b = state.books.find(x=>x.id==i.id);
        return sum + b.price*i.qty;
      },0);
      body.append(`<p><strong>Total: $${total.toFixed(2)}</strong></p>`);
      const clearBtn = $('<button class="btn small danger">Clear Cart</button>');
      clearBtn.on('click', ()=>{
        if(confirm('Clear cart?')){
          state.cart=[];
          localStorage.setItem('bookstore_cart', JSON.stringify(state.cart));
          renderCartCount();
          openManageModal(null,'cart');
        }
      });
      body.append(clearBtn);
    }
  } else if(type==='about'){
    const userName = $('.avatar').text() || 'Anonymous';
    body.append(`<h3>User Info</h3><p>Name: ${userName}</p>`);
    const cartCount = state.cart.reduce((s,i)=>s+i.qty,0);
    body.append(`<p>Books in Cart: ${cartCount}</p>`);
  }

  $('#modal').removeClass('hidden');
}

// Close any open modal when user clicks close or backdrop (hide all to avoid stacking)
$('.modal .close-modal, .modal .modal-backdrop').on('click', ()=> $('.modal').addClass('hidden'));

// --- Cart Functions ---
function renderCartCount(){
  const count = state.cart.reduce((s,i)=>s+i.qty,0);
  $('#cart-count').text(count);
}

function addToCart(bookId){
  const item = state.cart.find(i=>i.id==bookId);
  if(item) item.qty++;
  else state.cart.push({id:bookId, qty:1});
  localStorage.setItem('bookstore_cart', JSON.stringify(state.cart));
  renderCartCount();
  alert('Added to cart!');
}

// --- Search ---
$('#search').on('input', ()=> { state.page=1; applyFilter(); });
$('#search-clear').on('click', ()=> { $('#search').val(''); state.page=1; applyFilter(); });

// --- Sidebar Buttons ---
$('a[data-section="cart"]').on('click', e=>{ e.preventDefault(); openManageModal(null,'cart'); });
$('a[data-section="about"]').on('click', e=>{ e.preventDefault(); openManageModal(null,'about'); });
$('a[data-section="manage"]').on('click', e=>{ e.preventDefault(); openManageEditor(null); });

function bindUI(){
  renderCartCount();
}

// --- Init ---
$(document).ready(loadInitialBooks);


function openManageEditor(bookId){
  // hide details modal if open to avoid stacking
  $('#modal').addClass('hidden');

  $('#manage-modal').removeClass('hidden');
  refreshManageList();
  if(bookId){
    const b = state.books.find(x=>x.id==bookId);
    if(b) fillManageForm(b);
  } else {
    const mf = $('#manage-form');
    if(mf.length) mf[0].reset();
    $('#delete-book').hide();
  }
}

function refreshManageList(){
  const ml = $('#manage-list').empty();
  state.books.slice(0,50).forEach(b => {
    const item = $(`<div style="padding:8px;border-radius:8px;background:rgba(255,255,255,0.02);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:600">${b.title}</div>
        <small style="color:var(--muted)">${b.author} • ${b.genre}</small>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn small edit">Edit</button>
        <button class="btn small muted view">View</button>
      </div>
    </div>`);
    item.find('.edit').on('click', ()=> fillManageForm(b));
    // open details view using existing openManageModal(type='details')
    item.find('.view').on('click', ()=> openManageModal(b.id,'details'));
    ml.append(item);
  });
}

function fillManageForm(b){
  $('#manage-form [name=id]').val(b.id);
  $('#manage-form [name=title]').val(b.title);
  $('#manage-form [name=author]').val(b.author);
  $('#manage-form [name=genre]').val(b.genre);
  $('#manage-form [name=price]').val(b.price);
  $('#manage-form [name=cover]').val(b.cover);
  $('#manage-form [name=description]').val(b.description);
  $('#delete-book').show();
  $('#manage-modal').removeClass('hidden');
}

// Manage modal handlers
$('#close-manage, #manage-modal .modal-backdrop, #cancel-manage').on('click', ()=>{
  $('#manage-modal').addClass('hidden');
});

$('#manage-new').on('click', ()=> openManageEditor());

$('#manage-form').on('submit', function(e){
  e.preventDefault();
  const fm = $(this);
  const id = fm.find('[name=id]').val();
  const title = fm.find('[name=title]').val().trim();
  const author = fm.find('[name=author]').val().trim();
  const genre = fm.find('[name=genre]').val().trim();
  const price = parseFloat(fm.find('[name=price]').val()) || 0;
  const cover = fm.find('[name=cover]').val().trim();
  const description = fm.find('[name=description]').val().trim();

  if(!title){ alert('Title is required'); return; }

  if(id){
    // update
    const idx = state.books.findIndex(b=>b.id==id);
    if(idx>-1){
      state.books[idx] = { ...state.books[idx], title, author, genre, price, cover, description };
    }
  } else {
    // new id
    const maxId = state.books.reduce((m,b)=> Math.max(m, Number(b.id)||0), 0);
    const newBook = { id: maxId+1, title, author, genre, price, cover, description, rating:0, reviews:[] };
    state.books.unshift(newBook);
  }

  saveBooksToStorage();
  applyFilter();
  refreshManageList();
  $('#manage-modal').addClass('hidden');
});

$('#delete-book').on('click', ()=>{
  const id = $('#manage-form [name=id]').val();
  if(!id) return;
  if(!confirm('Delete this book?')) return;
  state.books = state.books.filter(b=>b.id!=id);
  saveBooksToStorage();
  applyFilter();
  refreshManageList();
  $('#manage-modal').addClass('hidden');
});
