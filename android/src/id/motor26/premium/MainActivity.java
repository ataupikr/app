package id.motor26.premium;
import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.provider.MediaStore;
import android.print.*;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import android.text.InputType;
import java.io.OutputStream;
import java.net.URI;

public class MainActivity extends Activity {
 private WebView web;
 private String origin="";
 private volatile boolean trusted=false;
 private LinearLayout root;
 private ProgressBar progress;
 private ValueCallback<Uri[]> files;
 private static final int CHOOSE_FILE=26;
 private int dp(int n){return (int)(getResources().getDisplayMetrics().density*n);}
 @Override public void onCreate(Bundle state){super.onCreate(state);String server=getPreferences(0).getString("server","");if(server.isEmpty())configure();else start(server);}
 private void configure(){
  trusted=false;if(web!=null){web.stopLoading();web.destroy();web=null;}
  root=new LinearLayout(this);root.setOrientation(1);root.setPadding(dp(24),dp(40),dp(24),dp(24));root.setBackgroundColor(Color.WHITE);
  TextView heading=new TextView(this);heading.setText("26 MOTOR PREMIUM");heading.setTextColor(Color.rgb(7,90,201));heading.setTextSize(26);root.addView(heading);
  TextView message=new TextView(this);message.setText("Hubungkan ke server bengkel\n\nGunakan alamat server yang dapat diakses dari HP. HP dan komputer server dapat memakai Wi-Fi yang sama. Gunakan HTTPS untuk akses dari internet.\n");message.setTextSize(16);root.addView(message);
  EditText server=new EditText(this);server.setSingleLine(true);server.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);server.setHint("http://192.168.1.10:3000");server.setText(getPreferences(0).getString("server",""));root.addView(server);
  Button connect=new Button(this);connect.setText("Hubungkan ke Server");root.addView(connect);connect.setOnClickListener(v->{try{URI uri=new URI(server.getText().toString().trim());if(!("http".equalsIgnoreCase(uri.getScheme())||"https".equalsIgnoreCase(uri.getScheme()))||uri.getHost()==null||uri.getRawUserInfo()!=null||uri.getPort()<-1||uri.getPort()>65535||uri.getRawQuery()!=null||uri.getRawFragment()!=null||!(uri.getPath()==null||uri.getPath().isEmpty()||uri.getPath().equals("/")))throw new Exception();String base=uri.getScheme().toLowerCase()+"://"+uri.getRawAuthority();getPreferences(0).edit().putString("server",base).apply();start(base);}catch(Exception ex){server.setError("Isi alamat server: http://alamat-ip:3000 atau https://domain");}});
  TextView help=new TextView(this);help.setText("\nAkun, password, dan hak akses mengikuti aplikasi bengkel. Alamat 127.0.0.1 di HP tidak menunjuk ke komputer server.");help.setTextSize(14);root.addView(help);setContentView(root);
 }
 private boolean sameOrigin(String value){try{URI a=new URI(origin),b=new URI(value);return a.getScheme().equalsIgnoreCase(b.getScheme())&&a.getHost().equalsIgnoreCase(b.getHost())&&(a.getPort()<0?("https".equalsIgnoreCase(a.getScheme())?443:80):a.getPort())==(b.getPort()<0?("https".equalsIgnoreCase(b.getScheme())?443:80):b.getPort())&&b.getRawUserInfo()==null;}catch(Exception ex){return false;}}
 private void start(String server){
  origin=server;trusted=false;root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(Color.WHITE);
  if(Build.VERSION.SDK_INT>=30)root.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars());v.setPadding(i.left,i.top,i.right,i.bottom);return insets;});
  LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(dp(12),0,dp(8),0);bar.setBackgroundColor(Color.rgb(7,90,201));
  TextView title=new TextView(this);title.setText("26 Motor Premium");title.setTextColor(Color.WHITE);title.setTextSize(17);bar.addView(title,new LinearLayout.LayoutParams(0,dp(48),1));title.setGravity(Gravity.CENTER_VERTICAL);
  Button home=new Button(this);home.setText("Aksi");home.setTextSize(12);home.setOnClickListener(v->web.loadUrl(origin+"/?mobile=1"));bar.addView(home);
  Button settings=new Button(this);settings.setText("Server");settings.setTextSize(12);settings.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("Ubah server?").setMessage("Pastikan semua isian sudah disimpan. Koneksi aktif akan ditutup.").setNegativeButton("Batal",null).setPositiveButton("Ubah",(d,w)->configure()).show());bar.addView(settings);root.addView(bar);
  progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);root.addView(progress,new LinearLayout.LayoutParams(-1,dp(3)));
  web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));WebSettings prefs=web.getSettings();prefs.setJavaScriptEnabled(true);prefs.setDomStorageEnabled(true);prefs.setAllowFileAccess(false);prefs.setAllowContentAccess(false);prefs.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);prefs.setSupportMultipleWindows(false);prefs.setUserAgentString(prefs.getUserAgentString()+" 26MotorAndroid/1.0");
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);web.addJavascriptInterface(new Documents(),"AndroidDocuments");
  web.setWebViewClient(new WebViewClient(){
   @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){trusted=sameOrigin(url);}
   @Override public void onPageFinished(WebView v,String url){trusted=sameOrigin(url);CookieManager.getInstance().flush();}
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){String url=request.getUrl().toString();if(sameOrigin(url))return false;if(!request.isForMainFrame())return true;String scheme=request.getUrl().getScheme();if("https".equals(scheme)||"http".equals(scheme)||"tel".equals(scheme)||"mailto".equals(scheme)){try{startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()));}catch(Exception ex){Toast.makeText(MainActivity.this,"Tautan belum dapat dibuka",Toast.LENGTH_LONG).show();}}return true;}
   @Override public void onReceivedError(WebView v,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame()){trusted=false;new AlertDialog.Builder(MainActivity.this).setTitle("Server belum terhubung").setMessage("Pastikan server bengkel aktif dan alamat dapat diakses dari HP. Periksa Wi-Fi atau koneksi internet.").setNegativeButton("Pengaturan server",(d,w)->configure()).setPositiveButton("Coba lagi",(d,w)->web.reload()).show();}}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onProgressChanged(WebView v,int value){progress.setProgress(value);progress.setVisibility(value==100?View.GONE:View.VISIBLE);}
   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){if(files!=null)files.onReceiveValue(null);files=callback;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");try{startActivityForResult(i,CHOOSE_FILE);}catch(Exception ex){files.onReceiveValue(null);files=null;}return true;}
  });
  setContentView(root);web.loadUrl(origin+"/?mobile=1");
 }
 public class Documents {
  @JavascriptInterface public boolean supportsExcel(){return true;}
  @JavascriptInterface public void saveDocument(String data,String requested){
   if(!trusted||data==null||requested==null||data.length()>32*1024*1024)return;
   String mime;if(data.startsWith("data:application/pdf;base64,"))mime="application/pdf";else if(data.startsWith("data:text/csv")&&data.substring(0,Math.min(100,data.length())).contains(";base64,"))mime="text/csv";else if(data.startsWith("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,"))mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";else return;
   if(!requested.matches("[A-Za-z0-9_-]{1,100}\\.(pdf|csv|xlsx)")||(!requested.endsWith(".pdf")&&!requested.endsWith(".csv")&&!requested.endsWith(".xlsx")))return;
   if(mime.equals("application/pdf")&&!requested.endsWith(".pdf")||mime.equals("text/csv")&&!requested.endsWith(".csv")||mime.endsWith("sheet")&&!requested.endsWith(".xlsx"))return;
   Uri uri=null;try{byte[] bytes=Base64.decode(data.substring(data.indexOf(',')+1),Base64.DEFAULT);if(bytes.length>24*1024*1024)return;if(mime.equals("application/pdf")&&(bytes.length<5||bytes[0]!='%'||bytes[1]!='P'||bytes[2]!='D'||bytes[3]!='F'||bytes[4]!='-'))return;
    ContentValues values=new ContentValues();values.put(MediaStore.MediaColumns.DISPLAY_NAME,requested);values.put(MediaStore.MediaColumns.MIME_TYPE,mime);values.put(MediaStore.MediaColumns.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/26Motor");values.put(MediaStore.MediaColumns.IS_PENDING,1);uri=getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);if(uri==null)throw new Exception("No destination");try(OutputStream out=getContentResolver().openOutputStream(uri)){out.write(bytes);}values.clear();values.put(MediaStore.MediaColumns.IS_PENDING,0);getContentResolver().update(uri,values,null,null);final Uri saved=uri;final String type=mime;
    runOnUiThread(()->new AlertDialog.Builder(MainActivity.this).setTitle("Dokumen tersimpan").setMessage(requested+"\nFolder Download / 26Motor").setNegativeButton("Tutup",null).setPositiveButton("Buka",(d,w)->{try{startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(saved,type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));}catch(Exception ex){Toast.makeText(MainActivity.this,"Buka dokumen dari folder Download",Toast.LENGTH_LONG).show();}}).show());
   }catch(Exception ex){if(uri!=null)getContentResolver().delete(uri,null,null);runOnUiThread(()->Toast.makeText(MainActivity.this,"Dokumen belum dapat disimpan. Coba kembali.",Toast.LENGTH_LONG).show());}
  }
  @JavascriptInterface public void printDocument(){if(!trusted)return;runOnUiThread(()->{if(web!=null&&sameOrigin(web.getUrl())){PrintManager printer=(PrintManager)getSystemService(PRINT_SERVICE);printer.print("26 Motor Gate Pass",web.createPrintDocumentAdapter("Gate Pass"),new PrintAttributes.Builder().build());}});}
 }
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==CHOOSE_FILE&&files!=null){files.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));files=null;}}
 @Override public void onBackPressed(){if(web!=null){web.evaluateJavascript("Boolean(document.querySelector('dialog[open]')||document.querySelector('#sidebar.open'))",value->{if("true".equals(value))web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){const close=d.querySelector('[data-close]');if(close)close.click();else d.close()}else document.querySelector('#sidebar')?.classList.remove('open')})()",null);else if(web.canGoBack())web.goBack();else new AlertDialog.Builder(this).setMessage("Tutup aplikasi 26 Motor?").setNegativeButton("Batal",null).setPositiveButton("Tutup",(d,w)->finish()).show();});}else super.onBackPressed();}
 @Override protected void onDestroy(){if(web!=null){web.destroy();web=null;}super.onDestroy();}
}
